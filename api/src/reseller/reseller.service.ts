import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { msg } from '../common/lang';
import { Admin, PanelClient } from './panel-client.service';
import { ProxyMeta, StoreService } from './store.service';
import { UhqClient, UhqError } from './uhq-client.service';

const ID_RE = /^[A-Za-z0-9_-]{5,64}$/;
/** Clés revendeur : préfixe `uhq_` ou `UHQ-` (casse indifférente), puis des caractères alphanumériques (tiret/underscore tolérés). */
const KEY_RE = /^uhq[_-][A-Za-z0-9_-]{16,160}$/i;

export interface Product {
  id: string;
  name: string;
  description: string | null;
  pricePerGb: number;
  priceUnit: 'GB' | 'MB';
  type?: string;
  minAmount: number;
  maxAmount: number | null;
  capabilities: Record<string, any>;
}

/** Valide un identifiant de proxy avant de l'insérer dans une URL. */
function checkId(id: string, lang: 'fr' | 'en'): string {
  if (!ID_RE.test(id ?? '')) throw new BadRequestException(msg(lang, 'badInput'));
  return id;
}

@Injectable()
export class ResellerService {
  private readonly logger = new Logger(ResellerService.name);
  private productsCache: { at: number; list: Product[] } | null = null;
  /** Une seule opération qui dépense de l'argent à la fois (double clic, deux onglets, deux admins). */
  private busy = false;

  constructor(
    private readonly store: StoreService,
    private readonly uhq: UhqClient,
    private readonly panel: PanelClient,
  ) {}

  private async exclusive<T>(admin: Admin, fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new HttpException(msg(admin.lang, 'busy'), 409);
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  // ── Paramètres / clé API ───────────────────────────────────────────────────
  status() {
    return { configured: !!this.store.getKey(), keyHint: this.store.keyHint() };
  }

  async setKey(admin: Admin, raw: unknown) {
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!KEY_RE.test(key)) throw new BadRequestException(msg(admin.lang, 'keyFormat'));
    // Vérifiée chez UHQ.Monster AVANT d'être mémorisée.
    const account = await this.uhq.call('GET', '/me', { key, lang: admin.lang });
    this.store.setKey(key);
    this.productsCache = null;
    this.store.log({ by: admin.email, action: 'key.set', detail: 'API key configured' });
    return { ...this.status(), account };
  }

  removeKey(admin: Admin) {
    this.store.setKey(null);
    this.productsCache = null;
    this.store.log({ by: admin.email, action: 'key.remove', detail: 'API key removed' });
    return this.status();
  }

  // ── Lecture ────────────────────────────────────────────────────────────────
  account(admin: Admin) {
    return this.uhq.call('GET', '/me', { lang: admin.lang });
  }

  async products(admin: Admin, fresh = false): Promise<Product[]> {
    if (!fresh && this.productsCache && Date.now() - this.productsCache.at < 5 * 60_000) return this.productsCache.list;
    const [products, limits] = await Promise.all([
      this.uhq.call<any[]>('GET', '/products', { lang: admin.lang }),
      this.uhq.call<any[]>('GET', '/limits', { lang: admin.lang }),
    ]);
    const lim = new Map((limits ?? []).map((l) => [l.productId, l]));
    const list: Product[] = (products ?? []).map((p) => {
      const l = lim.get(p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        pricePerGb: Number(p.pricePerGb),
        priceUnit: p.priceUnit === 'MB' ? 'MB' : 'GB',
        type: p.type,
        minAmount: Number(l?.minAmount ?? p.minPurchaseGb ?? 0),
        maxAmount: l ? (l.maxAmount ?? null) : (p.maxPurchaseGb ?? null),
        capabilities: p.capabilities ?? {},
      };
    });
    this.productsCache = { at: Date.now(), list };
    return list;
  }

  /** Les proxies achetés chez UHQ.Monster (SANS mot de passe), enrichis de leur catégorie dans le panel. */
  async list(admin: Admin) {
    const rows = await this.uhq.call<any[]>('GET', '/proxies', { lang: admin.lang });
    const meta = this.store.allMeta();
    return (rows ?? []).map((p) => ({
      id: p.id,
      productId: p.productId,
      productName: p.productName ?? null,
      label: p.label ?? null,
      status: p.status,
      host: p.host,
      port: p.port,
      username: p.username,
      totalGb: Number(p.totalGb ?? 0),
      usedGb: Number(p.usedGb ?? 0),
      expiresAt: p.expiresAt ?? null,
      category: meta[p.id]?.category ?? null,
      imported: !!meta[p.id]?.imported,
      importError: meta[p.id]?.importError ?? null,
    }));
  }

  /** Détail avec usage en direct ET identifiants (administrateur uniquement). */
  async detail(admin: Admin, id: string) {
    checkId(id, admin.lang);
    const d = await this.uhq.call<any>('GET', `/proxies/${id}`, { lang: admin.lang }).catch((e) => {
      if (e instanceof UhqError && e.getStatus() === 404) throw new NotFoundException(e.message);
      throw e;
    });
    const m = this.store.meta(id);
    return { ...d, category: m?.category ?? null, imported: !!m?.imported };
  }

  categories(admin: Admin) {
    return this.panel.categories(admin);
  }

  history() {
    return this.store.history();
  }

  // ── Achat ──────────────────────────────────────────────────────────────────
  async purchase(admin: Admin, body: any) {
    const lang = admin.lang;
    const productId = typeof body?.productId === 'string' ? body.productId : '';
    const amount = Number(body?.amountGb);
    const country = typeof body?.country === 'string' && body.country && body.country !== 'none' ? body.country.toUpperCase() : null;
    const proxyType = body?.proxyType === 'sticky' ? 'sticky' : body?.proxyType === 'rotating' ? 'rotating' : undefined;
    const expirationDays = body?.expirationDays === undefined || body?.expirationDays === null || body?.expirationDays === '' ? undefined : Number(body.expirationDays);
    const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim().slice(0, 64) : null;
    const doImport = body?.import !== false;
    let label = typeof body?.label === 'string' ? body.label.trim().replace(/[^\w .:@-]/g, '').slice(0, 64) : '';

    if (!ID_RE.test(productId) || !Number.isFinite(amount) || amount <= 0) throw new BadRequestException(msg(lang, 'badInput'));
    if (country && !/^[A-Z]{2}$/.test(country)) throw new BadRequestException(msg(lang, 'badInput'));
    if (expirationDays !== undefined && (!Number.isInteger(expirationDays) || expirationDays < 0 || expirationDays > 3650)) throw new BadRequestException(msg(lang, 'badInput'));
    // Libellé UNIQUE : c'est le seul moyen de retrouver le proxy après un échec ambigu (l'API n'a pas d'idempotence).
    if (!label) label = `panel-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

    return this.exclusive(admin, async () => {
      const products = await this.products(admin, true);
      const product = products.find((p) => p.id === productId);
      if (!product) throw new BadRequestException(msg(lang, 'unknownProduct'));
      if (amount < product.minAmount || (product.maxAmount !== null && amount > product.maxAmount)) {
        throw new BadRequestException(`${msg(lang, 'outOfLimits')} (${product.minAmount} – ${product.maxAmount ?? '∞'} ${product.priceUnit})`);
      }
      if (category) {
        const cats = await this.panel.categories(admin);
        if (!cats.includes(category)) throw new BadRequestException(msg(lang, 'badInput'));
      }

      // Coût estimé (hors produits dont le prix dépend de la durée : seul UHQ.Monster le connaît).
      const account: any = await this.uhq.call('GET', '/me', { lang });
      const discount = Number(account?.resellerDiscountPercent ?? 0);
      const estimated = product.capabilities?.durationPricing ? null : round2(product.pricePerGb * amount * (1 - discount / 100));
      if (estimated !== null && Number(account?.balance ?? 0) < estimated) throw new HttpException(msg(lang, 'lowBalance'), 402);

      const payload: Record<string, unknown> = { productId, amountGb: amount, label };
      if (country) payload.country = country;
      if (proxyType) payload.proxyType = proxyType;
      if (expirationDays !== undefined) payload.expirationDays = expirationDays;

      let created: any;
      let recovered = false;
      try {
        created = await this.uhq.call('POST', '/proxies', { body: payload, lang });
      } catch (e) {
        if (!(e instanceof UhqError) || !e.ambiguous) throw e;
        // Résultat incertain : on cherche le proxy par son libellé unique avant de conclure.
        created = await this.findByLabel(admin, label);
        if (!created) throw new HttpException(msg(lang, 'ambiguous'), 502);
        recovered = true;
      }

      const meta: ProxyMeta = {
        label,
        productId,
        productName: product.name,
        host: String(created.host),
        port: Number(created.port),
        username: String(created.username),
        category,
        imported: false,
        createdAt: new Date().toISOString(),
      };
      this.store.log({ by: admin.email, action: 'purchase', proxyId: created.id, label, detail: `${product.name} · ${amount} ${product.priceUnit}${country ? ` · ${country}` : ''}${estimated !== null ? ` · ~${estimated} EUR` : ''}` });

      let importError: string | undefined;
      if (doImport) {
        try {
          await this.panel.importProxy(admin, proxyUrl(created), category);
          meta.imported = true;
        } catch (e) {
          // L'achat est fait : on ne perd rien, l'import peut être relancé depuis « Mes proxies ».
          importError = String((e as Error)?.message ?? e).slice(0, 200);
          meta.importError = importError;
          this.logger.warn(`Import dans le panel échoué (proxy ${created.id}) : ${importError}`);
        }
      }
      this.store.setMeta(created.id, meta);

      return {
        proxy: { id: created.id, label, host: created.host, port: created.port, username: created.username, password: created.password, totalGb: created.totalGb, priceUnit: created.priceUnit ?? product.priceUnit },
        imported: meta.imported,
        importError: importError ?? null,
        category,
        estimatedCost: estimated,
        recovered,
      };
    });
  }

  private async findByLabel(admin: Admin, label: string): Promise<any | null> {
    try {
      const rows = await this.uhq.call<any[]>('GET', '/proxies', { lang: admin.lang });
      return (rows ?? []).find((p) => p.label === label) ?? null;
    } catch {
      return null;
    }
  }

  // ── Bande passante ─────────────────────────────────────────────────────────
  async balance(admin: Admin, id: string, body: any) {
    const lang = admin.lang;
    checkId(id, lang);
    const action = body?.action;
    if (action !== 'add' && action !== 'remove') throw new BadRequestException(msg(lang, 'badInput'));

    return this.exclusive(admin, async () => {
      let payload: Record<string, unknown> = { action: 'remove' };
      if (action === 'add') {
        const amount = Number(body?.amountGb);
        if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException(msg(lang, 'badInput'));
        const detail = await this.uhq.call<any>('GET', `/proxies/${id}`, { lang });
        const product = (await this.products(admin)).find((p) => p.id === detail?.productId);
        if (product) {
          if (amount < product.minAmount || (product.maxAmount !== null && amount > product.maxAmount)) {
            throw new BadRequestException(`${msg(lang, 'outOfLimits')} (${product.minAmount} – ${product.maxAmount ?? '∞'} ${product.priceUnit})`);
          }
          const account: any = await this.uhq.call('GET', '/me', { lang });
          const est = product.capabilities?.durationPricing ? null : round2(product.pricePerGb * amount * (1 - Number(account?.resellerDiscountPercent ?? 0) / 100));
          if (est !== null && Number(account?.balance ?? 0) < est) throw new HttpException(msg(lang, 'lowBalance'), 402);
        }
        payload = { action: 'add', amountGb: amount };
      }
      const r = await this.uhq.call<any>('POST', `/proxies/${id}/balance`, { body: payload, lang });
      const m = this.store.meta(id);
      this.store.log({ by: admin.email, action: action === 'add' ? 'balance.add' : 'balance.remove', proxyId: id, label: m?.label ?? null, detail: String(r?.message ?? '').slice(0, 200) });
      return { success: true, message: String(r?.message ?? '') };
    });
  }

  // ── Depuis la page « Pool » du panel ───────────────────────────────────────
  /** Retrouve, chez UHQ.Monster, le proxy correspondant à une ligne du pool (hôte + port + identifiant). */
  async lookup(admin: Admin, host: string, port: number, username: string) {
    if (!host || !Number.isInteger(port) || !username || host.length > 255 || username.length > 128) throw new BadRequestException(msg(admin.lang, 'badInput'));
    const rows = await this.uhq.call<any[]>('GET', '/proxies', { lang: admin.lang });
    const row = (rows ?? []).find((p) => p.host === host && Number(p.port) === port && p.username === username);
    if (!row) throw new NotFoundException('Proxy not found');
    const product = (await this.products(admin).catch(() => [] as Product[])).find((p) => p.id === row.productId);
    return {
      id: row.id,
      label: row.label ?? null,
      productId: row.productId,
      productName: row.productName ?? product?.name ?? null,
      status: row.status,
      totalGb: Number(row.totalGb ?? 0),
      usedGb: Number(row.usedGb ?? 0),
      priceUnit: product?.priceUnit ?? 'GB',
      minAmount: product?.minAmount ?? null,
      maxAmount: product?.maxAmount ?? null,
      capabilities: product?.capabilities ?? {},
    };
  }

  /**
   * Réinitialise le mot de passe chez UHQ.Monster (le nouveau est choisi par UHQ.Monster) puis met à jour le panel :
   * l'ancienne ligne du pool est retirée et la nouvelle (nouveaux identifiants) importée dans la même catégorie.
   */
  async resetPassword(admin: Admin, id: string, body: any) {
    const lang = admin.lang;
    checkId(id, lang);
    const panelId = typeof body?.panelProxyId === 'string' && ID_RE.test(body.panelProxyId) ? body.panelProxyId : null;
    const bodyCategory = typeof body?.category === 'string' && body.category.trim() ? body.category.trim().slice(0, 64) : null;

    return this.exclusive(admin, async () => {
      const before = await this.uhq.call<any>('GET', `/proxies/${id}`, { lang });
      const product = (await this.products(admin).catch(() => [] as Product[])).find((p) => p.id === before?.productId);
      if (product && product.capabilities?.resetPassword === false) throw new BadRequestException(msg(lang, 'noReset'));

      const r = await this.uhq.call<any>('PATCH', `/proxies/${id}`, { body: { password: true }, lang });
      let c = before?.credentials;
      let password = typeof r?.password === 'string' ? r.password : '';
      if (!password || password === c?.password) {
        const after = await this.uhq.call<any>('GET', `/proxies/${id}`, { lang });
        c = after?.credentials ?? c;
        password = c?.password ?? password;
      }

      const meta = this.store.meta(id);
      const category = bodyCategory ?? meta?.category ?? null;
      let imported = false;
      let syncError: string | null = null;
      try {
        if (panelId) await this.panel.deleteById(admin, panelId);
        else if (before?.credentials) await this.panel.removeProxy(admin, category, String(before.credentials.host), Number(before.credentials.port), String(before.credentials.username));
        await this.panel.importProxy(admin, proxyUrl({ host: c.host, port: c.port, username: c.username, password }), category);
        imported = true;
      } catch (e) {
        // Le mot de passe a DÉJÀ changé chez UHQ.Monster : on l'indique, l'import peut être relancé depuis « Mes proxies ».
        syncError = String((e as Error)?.message ?? e).slice(0, 200);
        this.logger.warn(`Mise à jour du panel après réinitialisation échouée (proxy ${id}) : ${syncError}`);
      }
      this.store.setMeta(id, {
        label: before?.label ?? meta?.label ?? null,
        productId: before?.productId ?? meta?.productId ?? null,
        productName: before?.productName ?? meta?.productName ?? null,
        host: String(c.host),
        port: Number(c.port),
        username: String(c.username),
        category,
        imported,
        ...(syncError ? { importError: syncError } : {}),
        createdAt: meta?.createdAt ?? new Date().toISOString(),
      });
      this.store.log({ by: admin.email, action: 'password.reset', proxyId: id, label: before?.label ?? null, detail: imported ? 'panel updated' : 'panel NOT updated' });
      return { success: true, password, imported, syncError };
    });
  }

  // ── Panel ──────────────────────────────────────────────────────────────────
  /** Importe (ou ré-importe, ou change de catégorie) un proxy déjà acheté chez UHQ.Monster. */
  async importExisting(admin: Admin, id: string, body: any) {
    const lang = admin.lang;
    checkId(id, lang);
    const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim().slice(0, 64) : null;
    if (category && !(await this.panel.categories(admin)).includes(category)) throw new BadRequestException(msg(lang, 'badInput'));

    const d = await this.uhq.call<any>('GET', `/proxies/${id}`, { lang });
    const c = d?.credentials;
    if (!c?.host || !c?.port || !c?.username) throw new BadRequestException(msg(lang, 'badInput'));
    await this.panel.importProxy(admin, proxyUrl(c), category);

    const prev = this.store.meta(id);
    this.store.setMeta(id, {
      label: d.label ?? prev?.label ?? null,
      productId: d.productId ?? prev?.productId ?? null,
      productName: d.productName ?? prev?.productName ?? null,
      host: String(c.host),
      port: Number(c.port),
      username: String(c.username),
      category,
      imported: true,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
    });
    this.store.log({ by: admin.email, action: 'import', proxyId: id, label: d.label ?? null, detail: category ? `category ${category}` : 'global pool' });
    return { imported: true, category };
  }

  /** Supprime le proxy chez UHQ.Monster (SANS remboursement — retirer la bande passante avant) et du panel. */
  async remove(admin: Admin, id: string) {
    const lang = admin.lang;
    checkId(id, lang);
    return this.exclusive(admin, async () => {
      const d = await this.uhq.call<any>('GET', `/proxies/${id}`, { lang });
      await this.uhq.call('DELETE', `/proxies/${id}`, { lang });
      const m = this.store.meta(id);
      let panelRemoved = false;
      const c = d?.credentials;
      if (c?.host && c?.username) {
        try {
          panelRemoved = await this.panel.removeProxy(admin, m?.category ?? null, String(c.host), Number(c.port), String(c.username));
        } catch (e) {
          this.logger.warn(`Retrait du panel échoué (proxy ${id}) : ${(e as Error)?.message ?? e}`);
        }
      }
      this.store.deleteMeta(id);
      this.store.log({ by: admin.email, action: 'delete', proxyId: id, label: d?.label ?? m?.label ?? null, detail: panelRemoved ? 'removed from panel' : 'panel entry not removed' });
      return { success: true, panelRemoved };
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `http://user:pass@host:port` — identifiants encodés (un mot de passe peut contenir `@`, `:` ou `/`). */
function proxyUrl(c: { host: string; port: number | string; username: string; password?: string }): string {
  return `http://${encodeURIComponent(c.username)}:${encodeURIComponent(c.password ?? '')}@${c.host}:${c.port}`;
}
