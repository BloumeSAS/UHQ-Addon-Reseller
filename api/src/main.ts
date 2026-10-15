import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import * as path from 'path';
import * as fs from 'fs';

// Charge .env si présent
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...rest] = line.trim().replace(/^#.*/, '').split('=');
    if (k && rest.length) process.env[k.trim()] ??= rest.join('=').trim();
  }
}

async function bootstrap() {
  // Pas de CORS : l'interface est servie par CET addon (même origine que son API),
  // y compris embarquée (/addon-proxy/reseller/) ou en iframe.
  const app = await NestFactory.create(AppModule, {
    cors: false,
    bodyParser: false,
    logger: ['error', 'warn', 'log'],
  });
  (app.getHttpAdapter().getInstance() as any).disable('x-powered-by');
  // Corps JSON borné : cette API ne reçoit que de petits objets de commande.
  app.use(json({ limit: '64kb' }));
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  UHQ.Monster Reseller Addon — NestJS        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  URL      : http://localhost:${port}`);
  console.log(`  Manifest : http://localhost:${port}/uhq-manifest.json`);
  console.log(`  Panel    : ${process.env.PANEL_URL ?? 'http://localhost:8000'}`);
  console.log('');
}

bootstrap();
