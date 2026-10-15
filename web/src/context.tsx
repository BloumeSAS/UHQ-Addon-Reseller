import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface AddonCtx {
  token: string;
  lang: 'fr' | 'en';
  theme: 'dark' | 'light';
  role: string;
  /** Fuseau IANA du navigateur — les heures/jours d'activité sont calculés dedans par le panel. */
  tz: string;
}

const browserTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const AddonContext = createContext<AddonCtx>({ token: '', lang: 'fr', theme: 'dark', role: 'USER', tz: browserTz });

/**
 * Mappe les variables du panel (format brut "H S% L%") vers les variables de
 * CE addon (format "hsl(H, S%, L%)"). Seules celles qui ont un équivalent
 * sémantique ici sont reprises.
 */
const PANEL_TO_ADDON_VAR: Record<string, string> = {
  background: 'bg',
  foreground: 'fg',
  muted: 'bg2',
  'muted-foreground': 'fg2',
  border: 'border',
  primary: 'primary',
  destructive: 'red',
};

function toHsl(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 3) return raw;
  const [h, s, l] = parts;
  return `hsl(${h}, ${s}, ${l})`;
}

/** Applique le thème custom du panel (Paramètres → Thème) via l'API de CET addon (évite CORS en déploiement externe). */
function applyPanelTheme(mode: 'light' | 'dark') {
  fetch(`${import.meta.env.BASE_URL}api/theme`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { themeColors: { light: Record<string, string>; dark: Record<string, string> } | null } | null) => {
      const colors = data?.themeColors?.[mode];
      if (!colors) return;
      const root = document.documentElement.style;
      for (const [panelKey, addonKey] of Object.entries(PANEL_TO_ADDON_VAR)) {
        const value = colors[panelKey];
        if (value) root.setProperty(`--${addonKey}`, toHsl(value));
      }
    })
    .catch(() => {
      /* cosmétique : repli silencieux sur la palette par défaut */
    });
}

export function AddonProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();

  const ctx: AddonCtx = {
    token: params.get('token') ?? '',
    lang: (params.get('lang') ?? 'fr') === 'en' ? 'en' : 'fr',
    theme: (params.get('theme') ?? 'dark') === 'light' ? 'light' : 'dark',
    role: params.get('role') ?? roleFromToken(params.get('token') ?? ''),
    tz: browserTz,
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', ctx.theme);
    applyPanelTheme(ctx.theme);
  }, [ctx.theme]);

  // Langue du document (lecteurs d'écran, césure, guillemets) : suit la langue choisie dans le panel.
  useEffect(() => {
    document.documentElement.lang = ctx.lang;
  }, [ctx.lang]);

  return <AddonContext.Provider value={ctx}>{children}</AddonContext.Provider>;
}

/** Rôle lu dans le JWT (affichage uniquement — le panel vérifie les droits à chaque appel). */
function roleFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload?.role ?? 'USER');
  } catch {
    return 'USER';
  }
}

export const useAddon = () => useContext(AddonContext);
