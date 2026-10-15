import { ForbiddenException, HttpException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { Lang, langOf, msg } from '../common/lang';

export interface Admin {
  token: string;
  id: string;
  email: string;
  lang: Lang;
}

/**
 * Client du panel avec le JWT de l'administrateur connecté.
 *
 * CET ADDON DÉPENSE DE L'ARGENT : contrairement à une simple lecture de statistiques, on ne se contente
 * pas de décoder le jeton (non signé ici). Chaque appelant est vérifié PAR LE PANEL (`/api/panel/security/me`,
 * qui contrôle la signature et l'expiration) et doit être ADMIN. Le résultat est mémorisé 30 s, indexé par
 * l'empreinte du jeton complet.
 */
@Injectable()
export class PanelClient {
  private readonly logger = new Logger(PanelClient.name);
  private readonly verified = new Map<string, { at: number; id: string; email: string }>();

  private get panelUrl(): string {
    return (process.env.PANEL_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
  }

  async requireAdmin(req: Request): Promise<Admin> {
    const lang = langOf(req);
    const auth = String(req.headers['authorization'] ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) throw new UnauthorizedException(msg(lang, 'tokenMissing'));

    const key = createHash('sha256').update(token).digest('hex');
    const hit = this.verified.get(key);
    if (hit && Date.now() - hit.at < 30_000) return { token, id: hit.id, email: hit.email, lang };

    const body: any = await this.request('GET', '/api/panel/security/me', token, undefined, lang).catch((e) => {
      if (e instanceof HttpException && [401, 403].includes(e.getStatus())) throw new UnauthorizedException(msg(lang, 'tokenInvalid'));
      throw e;
    });
    const user = body?.data;
    if (!user?.id) throw new UnauthorizedException(msg(lang, 'tokenInvalid'));
    if (user.role !== 'ADMIN') throw new ForbiddenException(msg(lang, 'adminOnly'));

    this.verified.set(key, { at: Date.now(), id: String(user.id), email: String(user.email ?? '') });
    if (this.verified.size > 200) {
      const cutoff = Date.now() - 30_000;
      for (const [k, v] of this.verified) if (v.at < cutoff) this.verified.delete(k);
    }
    return { token, id: String(user.id), email: String(user.email ?? ''), lang };
  }

  async request<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, token: string, body?: unknown, lang: Lang = 'fr'): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.panelUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'x-lang': lang,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e: any) {
      this.logger.warn(`Panel injoignable (${path}) : ${e?.message ?? e}`);
      throw new HttpException(msg(lang, 'panelDown'), 502);
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = Array.isArray(json?.message) ? json.message.join(', ') : json?.message ?? `HTTP ${res.status}`;
      throw new HttpException(String(m).slice(0, 300), res.status);
    }
    return json as T;
  }

  /** Noms des catégories (ProxyPool) du panel. */
  async categories(admin: Admin): Promise<string[]> {
    const r: any = await this.request('GET', '/api/panel/proxy-pools', admin.token, undefined, admin.lang);
    const list = Array.isArray(r?.data) ? r.data : [];
    return list.map((p: any) => String(p.name)).filter(Boolean);
  }

  /** Ajoute un proxy (`http://user:pass@host:port`) au pool du panel, dans la catégorie voulue (null = pool global). */
  async importProxy(admin: Admin, url: string, category: string | null): Promise<void> {
    const r: any = await this.request(
      'POST',
      '/api/panel/monitoring/proxies/import',
      admin.token,
      { text: url, protocol: 'http', ...(category ? { pool: category } : {}) },
      admin.lang,
    );
    if (r?.status === 'error') throw new HttpException(String(r?.message ?? 'import failed').slice(0, 300), 400);
    if (!r?.imported) throw new HttpException(String(r?.message ?? 'import failed').slice(0, 300), 400);
  }

  /**
   * Retire du panel le proxy importé (retrouvé par catégorie + hôte + port + identifiant). Sans catégorie, on ne
   * parcourt pas tout le pool partagé : retourne false et c'est à l'administrateur de le retirer dans « Pool ».
   */
  async removeProxy(admin: Admin, category: string | null, host: string, port: number, username: string): Promise<boolean> {
    if (!category) return false;
    let removed = false;
    for (let page = 0; page < 30; page++) {
      const q = `pool=${encodeURIComponent(category)}&limit=1000&page=${page}`;
      const r: any = await this.request('GET', `/api/panel/monitoring/proxies?${q}`, admin.token, undefined, admin.lang);
      for (const p of r?.data ?? []) {
        if (p.ip === host && Number(p.port) === port && String(p.url ?? '').includes(`${encodeURIComponent(username)}:`)) {
          await this.request('DELETE', `/api/panel/monitoring/proxies/${encodeURIComponent(p.id)}`, admin.token, undefined, admin.lang);
          removed = true;
        }
      }
      if (page + 1 >= Number(r?.pages ?? 0)) break;
    }
    return removed;
  }
}
