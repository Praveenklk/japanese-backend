import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Enable cookies
  app.use(cookieParser());

  // ✅ CORS (local + production)
  app.enableCors({
    origin: [
      'http://localhost:5173',                 // local dev
      process.env.FRONTEND_URL,               // production (Vercel)
    ].filter(Boolean), // removes undefined
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();
