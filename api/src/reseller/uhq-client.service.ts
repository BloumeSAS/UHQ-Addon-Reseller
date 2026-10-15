import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Lang, msg } from '../common/lang';
import { StoreService } from './store.service';

/** Erreur renvoyée par l'API UHQ.Monster (statut HTTP + message de leur API). */
export class UhqError extends HttpException {
  /** true = on ne sait pas si l'opération a été appliquée (timeout, coupure réseau, 5xx) : ne JAMAIS réessayer à l'aveugle. */
  constructor(message: string, status: number, readonly ambiguous = false) {
    super(message, status);
  }
}

/**
 * Client de l'API revendeur UHQ.Monster (https://uhq.monster/api/v2/reseller).
 * La clé vient du stockage de l'addon (réglée dans l'onglet Paramètres), jamais du navigateur.
 * `UHQ_API_BASE` ne sert qu'aux tests (serveur factice) : il n'est lu que depuis l'environnement.
 */
@Injectable()
export class UhqClient {
  private readonly logger = new Logger(UhqClient.name);
  private readonly base = (process.env.UHQ_API_BASE ?? 'https://uhq.monster/api/v2/reseller').replace(/\/+$/, '');

  constructor(private readonly store: StoreService) {}

  /** `key` explicite = vérification d'une clé avant de la mémoriser. */
  async call<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, opts: { body?: unknown; key?: string; lang?: Lang } = {}): Promise<T> {
    const lang = opts.lang ?? 'fr';
    const key = opts.key ?? this.store.getKey();
    if (!key) throw new UhqError(msg(lang, 'notConfigured'), 400);

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          'x-api-key': key,
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });
    } catch (e: any) {
      this.logger.warn(`UHQ.Monster injoignable (${method} ${path}) : ${e?.name ?? e}`);
      // Écriture : le serveur a pu appliquer la demande avant la coupure → résultat incertain.
      throw new UhqError(msg(lang, 'upstreamDown'), 502, method !== 'GET');
    }

    const body: any = await res.json().catch(() => ({}));
    if (res.ok) return body as T;

    const message = String(body?.error ?? `HTTP ${res.status}`).slice(0, 300);
    if (res.status === 401) throw new UhqError(msg(lang, 'keyRejected'), 400);
    // 500/503/504 : l'API ne garantit pas l'idempotence — pour une écriture, le résultat est incertain.
    // (502 = « rien n'a été modifié », d'après la documentation de l'API.)
    throw new UhqError(message, res.status, [500, 503, 504].includes(res.status) && method !== 'GET');
  }
}
