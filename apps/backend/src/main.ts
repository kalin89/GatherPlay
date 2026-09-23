// Carga apps/backend/.env en process.env antes de leer cualquier variable
// (ej. PORT abajo) — sin esto, .env es solo un archivo decorativo y hay que
// recordar prefijar cada comando a mano (ej. `PORT=3001 npm run ...`).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
