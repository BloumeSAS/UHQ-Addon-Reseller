import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import * as fs from 'fs';
import { ResellerModule } from './reseller/reseller.module';
import { ManifestController } from './manifest/manifest.controller';
import { ThemeController } from './manifest/theme.controller';

/** Résout le chemin du build React (web/dist) depuis n'importe où. */
function resolveWebDist(): string {
  // api/dist/main.js  →  ../../web/dist
  const candidate = path.join(__dirname, '..', '..', 'web', 'dist');
  if (fs.existsSync(candidate)) return candidate;
  return path.join(process.cwd(), '..', 'web', 'dist');
}

@Module({
  imports: [
    // Sert le build React (SPA fallback vers index.html)
    ServeStaticModule.forRoot({
      rootPath: resolveWebDist(),
      exclude: ['/api/(.*)'],
      serveStaticOptions: { index: false },
    }),
    ResellerModule,
  ],
  controllers: [ManifestController, ThemeController],
})
export class AppModule {}
