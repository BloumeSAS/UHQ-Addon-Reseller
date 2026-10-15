export type Lang = 'fr' | 'en';

export function fmtMoney(n: number | null | undefined, lang: Lang = 'fr'): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}

export function fmtNum(n: number | null | undefined, lang: Lang = 'fr', digits = 2): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(lang, { maximumFractionDigits: digits });
}

export function fmtDate(iso: string | null | undefined, lang: Lang = 'fr'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' });
}

/** Presse-papiers (repli pour les contextes sans l'API moderne, ex. iframe sans permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
