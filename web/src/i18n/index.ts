import { useCallback } from 'react';
import { useAddon } from '../context';
import { fr } from './fr';
import { en } from './en';

const DICT: Record<'fr' | 'en', Record<string, string>> = { fr, en };

export type Params = Record<string, string | number | null | undefined>;

/** Gabarits : `{name}` est remplacé par la valeur fournie. */
export function translate(lang: 'fr' | 'en', key: string, params: Params = {}): string {
  const tpl = DICT[lang][key] ?? DICT.fr[key] ?? key;
  return tpl.replace(/\{(\w+)\}/g, (_m, name: string) => (params[name] === undefined || params[name] === null ? '' : String(params[name])));
}

export function useT() {
  const { lang } = useAddon();
  return useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
}
