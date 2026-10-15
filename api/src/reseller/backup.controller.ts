import { Body, Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { StoreService } from './store.service';

/**
 * Intégration à la sauvegarde du panel (`backup` du manifest). Auth : en-tête X-Panel-Key = clé API du panel
 * (fournie à l'addon par le panel dans PANEL_API_KEY). Refuse tout si cette clé n'est pas configurée.
 * La clé API UHQ.Monster n'est JAMAIS exportée : à ressaisir après une restauration.
 */
@Controller('api/backup')
export class BackupController {
  constructor(private readonly store: StoreService) {}

  private check(key: string | undefined) {
    const expected = process.env.PANEL_API_KEY ?? '';
    const given = String(key ?? '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Invalid backup key');
  }

  @Get('export')
  export(@Headers('x-panel-key') key: string) {
    this.check(key);
    return this.store.exportBackup();
  }

  @Post('import')
  import(@Headers('x-panel-key') key: string, @Body() body: any) {
    this.check(key);
    this.store.restoreBackup(body);
    return { success: true };
  }
}
