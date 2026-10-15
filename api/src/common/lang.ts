import { Request } from 'express';

export type Lang = 'fr' | 'en';

/** Langue de l'appelant : en-tête `x-lang` (envoyé par l'interface), sinon `?lang=`, sinon Accept-Language, sinon français. */
export function langOf(req: Pick<Request, 'headers' | 'query'>): Lang {
  const raw = String(req.headers['x-lang'] ?? req.query?.['lang'] ?? req.headers['accept-language'] ?? 'fr').toLowerCase();
  return raw.startsWith('en') ? 'en' : 'fr';
}

const MESSAGES = {
  tokenMissing: { fr: 'Token manquant', en: 'Missing token' },
  tokenInvalid: { fr: 'Token invalide ou expiré', en: 'Invalid or expired token' },
  adminOnly: { fr: 'Réservé aux administrateurs', en: 'Administrators only' },
  panelDown: { fr: 'Panel injoignable', en: 'Panel unreachable' },
  notConfigured: { fr: "Clé API revendeur non configurée (onglet « Paramètres »).", en: 'Reseller API key not configured (“Settings” tab).' },
  keyFormat: { fr: 'Format de clé invalide : elle ressemble à « uhq_ » suivi de caractères.', en: 'Invalid key format: it looks like “uhq_” followed by characters.' },
  keyRejected: { fr: "Clé refusée par UHQ.Monster (invalide, révoquée ou compte revendeur non approuvé).", en: 'Key rejected by UHQ.Monster (invalid, revoked or reseller account not approved).' },
  upstreamDown: { fr: 'UHQ.Monster est injoignable ou a répondu trop lentement.', en: 'UHQ.Monster is unreachable or answered too slowly.' },
  busy: { fr: "Une opération d'achat est déjà en cours. Réessayez dans un instant.", en: 'A purchase operation is already running. Retry in a moment.' },
  badInput: { fr: 'Paramètres invalides', en: 'Invalid parameters' },
  unknownProduct: { fr: "Produit inconnu (rechargez la liste).", en: 'Unknown product (reload the list).' },
  outOfLimits: { fr: 'Quantité hors des limites du produit', en: 'Amount outside the product limits' },
  lowBalance: { fr: 'Solde insuffisant pour cet achat', en: 'Insufficient balance for this purchase' },
  ambiguous: {
    fr: "Résultat incertain : UHQ.Monster n'a pas répondu clairement et aucun proxy portant ce libellé n'a été retrouvé. Vérifiez la liste « Mes proxies » et votre solde AVANT de réessayer.",
    en: 'Uncertain result: UHQ.Monster did not answer clearly and no proxy with this label was found. Check “My proxies” and your balance BEFORE retrying.',
  },
  noReset: { fr: 'Ce produit ne permet pas de réinitialiser le mot de passe.', en: 'This product does not allow resetting the password.' },
  forbiddenKey: { fr: 'Clé de sauvegarde invalide', en: 'Invalid backup key' },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function msg(lang: Lang, key: MessageKey): string {
  return MESSAGES[key][lang];
}
