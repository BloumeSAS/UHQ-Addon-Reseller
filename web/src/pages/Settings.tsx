import { useT } from '../i18n';
import { Card, Notice } from '../components/ui';

interface Status {
  configured: boolean;
  keyHint: string | null;
}

/** La clé API revendeur se règle dans le panel : Paramètres → Extensions (cohérent avec les autres addons). */
export default function Settings({ status }: { status: Status; onChanged: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      {!status.configured && <Notice tone="warn">{t('set.needKey')}</Notice>}
      <Card title={t('set.keyTitle')}>
        <div className="space-y-3 text-sm">
          <p>{t('set.moved')}</p>
          {status.configured && (
            <p>
              {t('set.current')} <span className="mono">{status.keyHint}</span>
            </p>
          )}
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
