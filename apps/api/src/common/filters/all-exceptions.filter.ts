import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Every error leaves the API in one shape: { statusCode, code, message, details? }.
 *
 * Prisma's constraint errors are translated here rather than in each service, so a
 * duplicate branch code reads as "That branch code is already used" instead of a
 * raw P2002 leaking to the client. Unexpected errors are logged with their stack
 * but answered with a generic message — internals never reach the browser.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. The issue has been logged.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? exception.message;
        code = (b.code as string) ?? httpCode(status);
        details = b.details;
      }
      if (code === 'INTERNAL_ERROR') code = httpCode(status);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      status = mapped.status;
      code = mapped.code;
      message = mapped.message;
      details = mapped.details;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'INVALID_QUERY';
      message = 'The request could not be processed.';
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    reply.status(status).send({ statusCode: status, code, message, ...(details ? { details } : {}) });
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError) {
  const target = (e.meta?.target as string[] | string | undefined) ?? [];
  const fields = Array.isArray(target) ? target : [target];

  switch (e.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: 'DUPLICATE',
        message: duplicateMessage(fields),
        details: fields.length ? { fields } : undefined,
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: 'FOREIGN_KEY',
        message: 'A related record is missing or still in use.',
        details: undefined,
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'That record no longer exists.',
        details: undefined,
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: `PRISMA_${e.code}`,
        message: 'The request could not be completed.',
        details: undefined,
      };
  }
}

function duplicateMessage(fields: string[]) {
  const f = fields.join(', ');
  if (f.includes('code')) return 'That code is already used in this organization.';
  if (f.includes('email')) return 'That email address is already registered.';
  if (f.includes('slug')) return 'That identifier is already taken.';
  if (f.includes('name')) return 'That name is already used in this organization.';
  return 'A record with these details already exists.';
}

function httpCode(status: number) {
  return (
    {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
    }[status] ?? 'ERROR'
  );
}
