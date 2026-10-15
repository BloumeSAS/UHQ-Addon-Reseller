import { useState } from 'react';
import { useAddon } from '../context';
import { useT } from '../i18n';
import { useApi } from '../lib/api';
import { fmtMoney } from '../lib/format';
import { Card, ErrorBox, Field, Notice } from '../components/ui';

interface Status {
  configured: boolean;
  keyHint: string | null;
}

/** Paramètres : clé API revendeur UHQ.Monster (vérifiée avant d'être enregistrée, jamais ré-affichée). */
export default function Settings({ status, onChanged }: { status: Status; onChanged: () => void }) {
  const t = useT();
  const { lang } = useAddon();
  const api = useApi();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const r = await api.put<{ account: { balance: number; email: string } }>('settings', { apiKey: key.trim() });
      setKey('');
      setOk(t('set.saved', { email: r.account.email, balance: fmtMoney(r.account.balance, lang) }));
      onChanged();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('set.removeConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      await api.del('settings');
      setOk('');
      onChanged();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!status.configured && <Notice tone="warn">{t('set.needKey')}</Notice>}
      {error && <ErrorBox message={error} />}
      {ok && <div className="success-box text-sm">{ok}</div>}

      <Card title={t('set.keyTitle')}>
        <div className="space-y-3">
          {status.configured && (
            <div className="text-sm">
              {t('set.current')} <span className="mono">{status.keyHint}</span>
            </div>
          )}
          <Field label={status.configured ? t('set.replace') : t('set.key')} hint={t('set.keyHint')}>
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="uhq_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <div className="flex gap-2 wrap">
            <button className="btn btn-primary" disabled={busy || key.trim().length < 10} onClick={save}>{busy ? t('buy.busy') : t('set.save')}</button>
            {status.configured && <button className="btn btn-danger" disabled={busy} onClick={remove}>{t('set.remove')}</button>}
          </div>
        </div>
      </Card>

      <Card title={t('set.howTitle')}>
        <ol className="text-sm space-y-3" style={{ paddingLeft: '1.2rem' }}>
          <li>{t('set.how1')}</li>
          <li>{t('set.how2')}</li>
          <li>{t('set.how3')}</li>
        </ol>
        <p className="hint mt-3">{t('set.security')}</p>
      </Card>
    </div>
  );
}
