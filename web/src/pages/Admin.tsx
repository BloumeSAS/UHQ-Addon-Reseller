import { useState } from 'react';
import { useAddon } from '../context';
import { useT } from '../i18n';
import { useLoad } from '../lib/api';
import { Icon, IconName } from '../components/icons';
import { BuyForm } from '../components/BuyForm';
import { Card, ErrorBox, Loading, Notice } from '../components/ui';
import Overview from './Overview';
import Proxies from './Proxies';
import History from './History';
import Settings from './Settings';

const SECTIONS = [
  { id: 'overview', icon: 'overview', group: 'main' },
  { id: 'buy', icon: 'buy', group: 'main' },
  { id: 'proxies', icon: 'proxies', group: 'main' },
  { id: 'history', icon: 'history', group: 'main' },
  { id: 'settings', icon: 'settings', group: 'config' },
] as const satisfies readonly { id: string; icon: IconName; group: string }[];

const GROUPS = ['main', 'config'] as const;
type TabId = (typeof SECTIONS)[number]['id'];

/** Page de l'addon (ADMIN) : navigation latérale façon « Paramètres » du panel. */
export default function Admin() {
  const { role } = useAddon();
  const t = useT();
  const status = useLoad<{ configured: boolean; keyHint: string | null }>('status');
  const [tab, setTab] = useState<TabId | null>(null);

  if (role !== 'ADMIN') return <div className="page"><Notice tone="warn">{t('adminOnly')}</Notice></div>;
  if (status.loading && !status.data) return <div className="page"><Loading /></div>;
  if (status.error) return <div className="page"><ErrorBox message={status.error} onRetry={status.reload} /></div>;

  const configured = !!status.data?.configured;
  // Sans clé API, seule la page Paramètres a un sens.
  const current: TabId = !configured ? 'settings' : tab ?? 'overview';
  const active = SECTIONS.find((s) => s.id === current)!;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="section-title">UHQ.Monster Reseller</h1>
          <p className="text-sm text-muted">{t('admin.subtitle')}</p>
        </div>
      </div>

      <div className="settings">
        <nav className="snav" aria-label="UHQ.Monster Reseller">
          {GROUPS.map((g) => (
            <div key={g} className="snav-group">
              <p className="snav-group-title">{t(`group.${g}`)}</p>
              {SECTIONS.filter((s) => s.group === g).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`snav-item ${s.id === current ? 'active' : ''}`}
                  aria-current={s.id === current ? 'page' : undefined}
                  disabled={!configured && s.id !== 'settings'}
                  onClick={() => { setTab(s.id); window.scrollTo({ top: 0 }); }}
                >
                  <span style={{ marginTop: 2 }}><Icon name={s.icon} /></span>
                  <span>
                    <span className="snav-label">{t(`tab.${s.id}`)}</span>
                    <span className="snav-desc">{t(`tab.${s.id}Desc`)}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="settings-main space-y-4">
          <div className="section-head">
            <div className="section-icon"><Icon name={active.icon} size={18} /></div>
            <div>
              <h2>{t(`tab.${active.id}`)}</h2>
              <p>{t(`tab.${active.id}Desc`)}</p>
            </div>
          </div>

          {current === 'overview' && <Overview goto={(x) => setTab(x)} />}
          {current === 'buy' && <Card><BuyForm /></Card>}
          {current === 'proxies' && <Proxies onChanged={() => undefined} />}
          {current === 'history' && <History />}
          {current === 'settings' && <Settings status={status.data!} onChanged={status.reload} />}
        </div>
      </div>
    </div>
  );
}
