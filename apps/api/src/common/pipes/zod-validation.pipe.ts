import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodIssue, ZodSchema } from 'zod';

/**
 * Detects a Zod failure structurally rather than with `instanceof ZodError`.
 *
 * zod ships both ESM and CJS builds. The schemas come from @acadia/validation
 * (resolved as ESM) while this compiled pipe resolves zod as CJS, so the two
 * carry different ZodError classes and `instanceof` is false across that
 * boundary — which silently turned every validation failure into a 500.
 */
function asZodIssues(err: unknown): ZodIssue[] | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { name?: unknown; issues?: unknown };
  if (e.name !== 'ZodError' || !Array.isArray(e.issues)) return null;
  return e.issues as ZodIssue[];
}

/**
 * Validates a body/query against a shared @acadia/validation schema and returns
 * the *parsed* value, so transforms (trim, lowercase, coercion) reach the service.
 *
 * Field errors come back keyed by path so the frontend can attach each message to
 * its input without re-deriving the mapping.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issues = asZodIssues(result.error) ?? [];
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      const key = issue.path.join('.') || '_';
      fieldErrors[key] ??= issue.message;
    }

    throw new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Some fields need attention.',
      details: fieldErrors,
    });
  }
}

/** `@Body(zodBody(createOrganizationSchema))` reads better at the call site. */
export const zodBody = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
