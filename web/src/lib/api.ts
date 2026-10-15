import { useCallback, useEffect, useRef, useState } from 'react';
import { useAddon } from '../context';

/**
 * Client HTTP de l'addon. Les URLs sont préfixées par BASE_URL ("/" en déploiement classique,
 * "/addon-proxy/reseller/" une fois embarqué dans le panel) : jamais de chemin absolu "/api/...".
 * Le jeton du panel ne passe que dans l'en-tête Authorization.
 */
export function createApi(token: string, lang: 'fr' | 'en' = 'fr') {
  const base = import.meta.env.BASE_URL;

  async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${base}api/reseller/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'x-lang': lang,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data as any)?.message ?? (data as any)?.error ?? `HTTP ${res.status}`;
      throw new ApiError(Array.isArray(message) ? message.join(', ') : String(message), res.status);
    }
    return data as T;
  }

  return {
    get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function useApi() {
  const { token, lang } = useAddon();
  return createApi(token, lang);
}

export interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/** Charge `path` (GET) et le recharge quand `path` change ou via `reload()`. */
export function useLoad<T>(path: string, enabled = true): LoadState<T> {
  const { token, lang } = useAddon();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !token) return;
    const ctrl = new AbortController();
    const id = ++seq.current;
    setLoading(true);
    setError('');
    createApi(token, lang)
      .get<T>(path, ctrl.signal)
      .then((r) => id === seq.current && setData(r))
      .catch((e) => {
        if (id !== seq.current || e?.name === 'AbortError') return;
        setError(String(e?.message ?? e));
      })
      .finally(() => id === seq.current && setLoading(false));
    return () => ctrl.abort();
  }, [token, lang, path, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
