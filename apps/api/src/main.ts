import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { loadEnv } from './common/config/env';

async function bootstrap() {
  const env = loadEnv();

  // Fastify, not Express — required by the specification.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Behind a load balancer the client IP must come from the proxy header,
      // otherwise rate limiting and audit logs record the balancer's address.
      trustProxy: true,
      bodyLimit: 2 * 1024 * 1024,
    }),
    { bufferLogs: true },
  );

  await app.register(helmet, {
    contentSecurityPolicy: false, // The API serves JSON; the frontends set their own CSP.
  });

  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');
  // No global ValidationPipe: request validation is Zod-based via ZodValidationPipe,
  // declared per route from the schemas in @acadia/validation. Adding Nest's pipe
  // here would pull in class-validator to do nothing.
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on http://localhost:${env.API_PORT}/api`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Failed to start', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
