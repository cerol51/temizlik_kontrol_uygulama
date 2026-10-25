import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { assertAuthConfiguration } from './auth';

async function bootstrap(): Promise<void> {
  assertAuthConfiguration();
  const app = await NestFactory.create(AppModule);

  // Dağıtık ortamda SIGTERM/SIGINT ile zarif kapanma (Graceful Shutdown)
  app.enableShutdownHooks();

  if (process.env.TRUST_PROXY === 'true') {
    (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);
  }

  // Dağıtık İzleme (Distributed Tracing): Her isteğe X-Correlation-Id enjekte et
  app.use((req: any, res: any, next: any) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  });

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.setGlobalPrefix('api');

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : true;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Correlation-Id',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Correlation-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
