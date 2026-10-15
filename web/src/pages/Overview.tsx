import { useAddon } from '../context';
import { useT } from '../i18n';
import { useLoad } from '../lib/api';
import { fmtMoney, fmtNum } from '../lib/format';
import { ProxyRow } from './Proxies';
import { Card, ErrorBox, Loading, Notice, Stat } from '../components/ui';

interface Account {
  email: string;
  name?: string;
  balance: number;
  currency: string;
  resellerDiscountPercent?: number;
  createdAt?: string;
}

/** Aperçu : solde du portefeuille, remise revendeur et synthèse des proxies achetés. */
export default function Overview({ goto }: { goto: (tab: 'buy' | 'proxies') => void }) {
  const t = useT();
  const { lang } = useAddon();
  const account = useLoad<Account>('account');
  const proxies = useLoad<ProxyRow[]>('proxies');

  if (account.loading && !account.data) return <Loading />;
  if (account.error) return <ErrorBox message={account.error} onRetry={account.reload} />;
  const a = account.data!;
  const rows = proxies.data ?? [];
  const total = rows.reduce((s, r) => s + r.totalGb, 0);
  const used = rows.reduce((s, r) => s + r.usedGb, 0);
  const active = rows.filter((r) => r.status === 'ACTIVE').length;
  const notImported = rows.filter((r) => !r.imported).length;

  return (
    <div className="space-y-4">
      <div className="stat-grid">
        <Stat label={t('ov.balance')} value={fmtMoney(a.balance, lang)} sub={a.email} tone={a.balance < 5 ? 'warn' : undefined} />
        <Stat label={t('ov.discount')} value={`${fmtNum(a.resellerDiscountPercent ?? 0, lang)} %`} sub={t('ov.discountSub')} />
        <Stat label={t('ov.proxies')} value={fmtNum(rows.length, lang, 0)} sub={t('ov.activeSub', { n: active })} />
        <Stat label={t('ov.bought')} value={`${fmtNum(total, lang)} ${t('unit.gb')}`} sub={t('ov.usedSub', { used: fmtNum(used, lang), left: fmtNum(Math.max(0, total - used), lang) })} />
      </div>

      {a.balance < 5 && <Notice tone="warn">{t('ov.lowBalance')}</Notice>}
      {notImported > 0 && <Notice tone="warn">{t('ov.notImported', { n: notImported })}</Notice>}

      <Card title={t('ov.actions')}>
        <div className="flex gap-2 wrap">
          <button className="btn btn-primary" onClick={() => goto('buy')}>{t('ov.buy')}</button>
          <button className="btn btn-outline" onClick={() => goto('proxies')}>{t('ov.manage')}</button>
        </div>
        <p className="hint mt-3">{t('ov.topup')}</p>
      </Card>
    </div>
  );
}
