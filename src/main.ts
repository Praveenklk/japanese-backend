// main.ts (TOP of file)
import { webcrypto } from 'crypto';

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto as any;
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Enable cookies
  app.use(cookieParser());

  // ✅ TRUST PROXY (Railway / Vercel)
  const server = app.getHttpAdapter().getInstance();
  server.set('trust proxy', 1);

  // ✅ CORS
  app.enableCors({
    origin: [
      'http://localhost:5173',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();
