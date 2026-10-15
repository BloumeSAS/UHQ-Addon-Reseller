import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/** Ce que l'addon retient d'un proxy acheté (JAMAIS son mot de passe : il se relit chez UHQ.Monster). */
export interface ProxyMeta {
  label: string | null;
  productId: string | null;
  productName: string | null;
  host: string;
  port: number;
  username: string;
  /** Catégorie du panel où le proxy a été importé (null = pool global). */
  category: string | null;
  imported: boolean;
  importError?: string;
  createdAt: string;
}

export interface HistoryEntry {
  ts: string;
  by: string;
  action: 'key.set' | 'key.remove' | 'purchase' | 'balance.add' | 'balance.remove' | 'import' | 'delete' | 'password.reset';
  proxyId?: string;
  label?: string | null;
  detail: string;
}

interface Data {
  apiKey: string | null;
  proxies: Record<string, ProxyMeta>;
  history: HistoryEntry[];
}

const MAX_HISTORY = 500;

/**
 * Stockage JSON local (fichier `DB_PATH`, comme les addons Wallet/Orders).
 * La clé API revendeur y est conservée : fichier en mode 0600, écriture atomique,
 * jamais renvoyée à l'interface (seuls les 4 derniers caractères le sont) ni exportée par la sauvegarde.
 */
@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);
  private readonly file = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'reseller-data.json');
  private data: Data = { apiKey: null, proxies: {}, history: [] };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = {
          apiKey: typeof raw.apiKey === 'string' && raw.apiKey ? raw.apiKey : null,
          proxies: raw.proxies && typeof raw.proxies === 'object' ? raw.proxies : {},
          history: Array.isArray(raw.history) ? raw.history.slice(-MAX_HISTORY) : [],
        };
      }
    } catch (e) {
      this.logger.error(`Lecture de ${this.file} impossible : ${(e as Error).message}`);
    }
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (e) {
      this.logger.error(`Écriture de ${this.file} impossible : ${(e as Error).message}`);
    }
  }

  // ── Clé API ────────────────────────────────────────────────────────────────
  getKey(): string | null {
    return this.data.apiKey;
  }
  setKey(key: string | null) {
    this.data.apiKey = key;
    this.save();
  }
  keyHint(): string | null {
    const k = this.data.apiKey;
    return k ? `${k.slice(0, 4)}…${k.slice(-4)}` : null;
  }

  // ── Proxies ────────────────────────────────────────────────────────────────
  meta(id: string): ProxyMeta | undefined {
    return this.data.proxies[id];
  }
  allMeta(): Record<string, ProxyMeta> {
    return this.data.proxies;
  }
  setMeta(id: string, m: ProxyMeta) {
    this.data.proxies[id] = m;
    this.save();
  }
  deleteMeta(id: string) {
    delete this.data.proxies[id];
    this.save();
  }

  // ── Historique ─────────────────────────────────────────────────────────────
  log(entry: Omit<HistoryEntry, 'ts'>) {
    this.data.history.push({ ts: new Date().toISOString(), ...entry });
    if (this.data.history.length > MAX_HISTORY) this.data.history.splice(0, this.data.history.length - MAX_HISTORY);
    this.save();
  }
  history(): HistoryEntry[] {
    return [...this.data.history].reverse();
  }

  // ── Sauvegarde du panel (sans la clé API) ──────────────────────────────────
  exportBackup() {
    return { proxies: this.data.proxies, history: this.data.history, exportedAt: new Date().toISOString() };
  }
  restoreBackup(b: { proxies?: Record<string, ProxyMeta>; history?: HistoryEntry[] }) {
    this.data.proxies = b?.proxies && typeof b.proxies === 'object' ? b.proxies : {};
    this.data.history = Array.isArray(b?.history) ? b.history.slice(-MAX_HISTORY) : [];
    this.save();
  }
}
