import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Enable cookies
  app.use(cookieParser());

  // ✅ TRUST PROXY (Railway / Vercel)
  const server = app.getHttpAdapter().getInstance();
  server.set('trust proxy', 1);

  // ✅ SERVE ANKI MEDIA (IMAGES + AUDIO)
  const mediaPath = path.join(process.cwd(), 'uploads', 'anki-media');

  app.use(
    '/media',
    express.static(mediaPath, {
      maxAge: '30d', // cache for performance
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

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
  console.log(`📂 Media served from: ${mediaPath}`);
}

bootstrap();
