import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Enable cookies
  app.use(cookieParser());

  // ✅ TRUST PROXY (Railway fix)
  const server = app.getHttpAdapter().getInstance();
  server.set('trust proxy', 1);

  // ✅ CORS (local + production)
  app.enableCors({
    origin: [
      'http://localhost:5173',
      process.env.FRONTEND_URL, // https://japanese-frontend-iota.vercel.app
    ].filter(Boolean),
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();
