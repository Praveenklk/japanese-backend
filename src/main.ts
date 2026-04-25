import { webcrypto } from 'crypto';

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto as any;
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const server = app.getHttpAdapter().getInstance();
  server.set('trust proxy', 1);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port, '0.0.0.0'); // 🔥 IMPORTANT

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();