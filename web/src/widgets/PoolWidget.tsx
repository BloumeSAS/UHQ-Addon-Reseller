/**
 * Widget de la page « Pool de proxies » du panel : achat rapide d'un proxy UHQ.Monster, importé directement
 * dans une catégorie. Manifeste : { "zone": "/pool", "path": "/widget/pool", "height": 240 }
 */
import { useAddon } from '../context';
import { useT } from '../i18n';
import { useLoad } from '../lib/api';
import { fmtMoney } from '../lib/format';
import { BuyForm } from '../components/BuyForm';

export default function PoolWidget() {
  const { role, lang } = useAddon();
  const t = useT();
  const status = useLoad<{ configured: boolean }>('status', role === 'ADMIN');
  const account = useLoad<{ balance: number }>('account', role === 'ADMIN' && !!status.data?.configured);

  // Réservé aux admins ; silencieux tant que la clé API n'est pas configurée (pas d'erreur dans la page Pool).
  if (role !== 'ADMIN') return null;
  if (!status.data) return null;

  return (
    <div className="card widget-form" style={{ margin: 0 }}>
      <div className="flex items-center justify-between gap-3 wrap">
        <strong className="text-sm">🛒 {t('widget.title')}</strong>
        {account.data && <span className="text-xs text-muted">{t('buy.balance', { balance: fmtMoney(account.data.balance, lang) })}</span>}
      </div>
      {status.data.configured ? <BuyForm compact /> : <p className="text-sm text-muted mt-2">{t('widget.notConfigured')}</p>}
    </div>
  );
}
