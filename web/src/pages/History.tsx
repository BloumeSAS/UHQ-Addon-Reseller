import { useAddon } from '../context';
import { useT } from '../i18n';
import { useLoad } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Badge, Card, Empty, ErrorBox, Loading } from '../components/ui';

interface Entry {
  ts: string;
  by: string;
  action: string;
  proxyId?: string;
  label?: string | null;
  detail: string;
}

const TONE: Record<string, 'good' | 'bad' | 'warn' | 'info' | 'muted'> = {
  purchase: 'good',
  'balance.add': 'good',
  'balance.remove': 'warn',
  import: 'info',
  delete: 'bad',
  'key.set': 'muted',
  'key.remove': 'muted',
};

/** Journal des opérations faites depuis le panel (jamais de secret dedans). */
export default function History() {
  const t = useT();
  const { lang } = useAddon();
  const h = useLoad<Entry[]>('history');
  if (h.loading && !h.data) return <Loading />;
  if (h.error) return <ErrorBox message={h.error} onRetry={h.reload} />;
  const rows = h.data ?? [];
  return (
    <Card title={t('hist.title')} right={<button className="btn btn-outline btn-sm" onClick={h.reload}>↻ {t('refresh')}</button>}>
      {rows.length === 0 ? (
        <Empty>{t('hist.empty')}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('hist.date')}</th><th>{t('hist.action')}</th><th>{t('proxies.label')}</th><th>{t('hist.detail')}</th><th>{t('hist.by')}</th></tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={`${e.ts}-${i}`}>
                  <td className="text-xs" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.ts, lang)}</td>
                  <td><Badge tone={TONE[e.action] ?? 'muted'}>{t(`act.${e.action}`)}</Badge></td>
                  <td>{e.label ?? '—'}</td>
                  <td className="text-sm">{e.detail}</td>
                  <td className="text-xs text-muted">{e.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
