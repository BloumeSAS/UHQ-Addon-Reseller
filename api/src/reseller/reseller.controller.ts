import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { PanelClient } from './panel-client.service';
import { ResellerService } from './reseller.service';

/**
 * Toutes les routes sont réservées aux ADMIN (vérifiés par le panel) : cet addon dépense le solde du revendeur.
 * La clé API UHQ.Monster n'est jamais renvoyée ; seuls 4 caractères de début et de fin le sont (`keyHint`).
 */
@Controller('api/reseller')
export class ResellerController {
  constructor(
    private readonly panel: PanelClient,
    private readonly svc: ResellerService,
  ) {}

  @Get('status')
  async status(@Req() req: Request) {
    await this.panel.requireAdmin(req);
    return this.svc.status();
  }

  @Put('settings')
  async setKey(@Req() req: Request, @Body() body: { apiKey?: string }) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.setKey(admin, body?.apiKey);
  }

  @Delete('settings')
  async removeKey(@Req() req: Request) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.removeKey(admin);
  }

  @Get('account')
  async account(@Req() req: Request) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.account(admin);
  }

  @Get('products')
  async products(@Req() req: Request) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.products(admin, req.query['fresh'] === '1');
  }

  @Get('categories')
  async categories(@Req() req: Request) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.categories(admin);
  }

  @Get('history')
  async history(@Req() req: Request) {
    await this.panel.requireAdmin(req);
    return this.svc.history();
  }

  @Get('proxies')
  async list(@Req() req: Request) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.list(admin);
  }

  @Get('proxies/:id')
  async detail(@Req() req: Request, @Param('id') id: string) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.detail(admin, id);
  }

  @Get('lookup')
  async lookup(@Req() req: Request) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.lookup(admin, String(req.query['host'] ?? ''), Number(req.query['port']), String(req.query['username'] ?? ''));
  }

  @Post('proxies')
  async purchase(@Req() req: Request, @Body() body: unknown) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.purchase(admin, body);
  }

  @Post('proxies/:id/balance')
  async balance(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.balance(admin, id, body);
  }

  @Post('proxies/:id/password')
  async resetPassword(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.resetPassword(admin, id, body);
  }

  @Post('proxies/:id/import')
  async importExisting(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.importExisting(admin, id, body);
  }

  @Delete('proxies/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const admin = await this.panel.requireAdmin(req);
    return this.svc.remove(admin, id);
  }
}
