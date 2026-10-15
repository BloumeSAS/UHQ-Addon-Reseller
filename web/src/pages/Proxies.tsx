import { useState } from 'react';
import { useAddon } from '../context';
import { useT } from '../i18n';
import { useApi, useLoad } from '../lib/api';
import { copyText, fmtDate, fmtNum } from '../lib/format';
import { Product } from '../components/BuyForm';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, Notice } from '../components/ui';

export interface ProxyRow {
  id: string;
  productId: string;
  productName: string | null;
  label: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  host: string;
  port: number;
  username: string;
  totalGb: number;
  usedGb: number;
  expiresAt: string | null;
  category: string | null;
  imported: boolean;
  importError: string | null;
}

type Dialog =
  | { kind: 'add' | 'remove' | 'import' | 'delete' | 'detail'; row: ProxyRow }
  | null;

/** Mes proxies : liste, détail avec usage en direct, ajout / reprise de Go, import dans le panel, suppression. */
export default function Proxies({ onChanged }: { onChanged: () => void }) {
  const t = useT();
  const { lang } = useAddon();
  const list = useLoad<ProxyRow[]>('proxies');
  const products = useLoad<Product[]>('products');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [flash, setFlash] = useState('');

  const done = (message?: string) => {
    setDialog(null);
    if (message) setFlash(message);
    list.reload();
    onChanged();
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  const rows = list.data ?? [];
  const productOf = (id: string) => products.data?.find((p) => p.id === id);

  return (
    <div className="space-y-3">
      {flash && <div className="success-box text-sm">{flash}</div>}
      <Card
        title={t('proxies.title', { n: rows.length })}
        right={<button className="btn btn-outline btn-sm" onClick={list.reload}>↻ {t('refresh')}</button>}
      >
        {rows.length === 0 ? (
          <Empty>{t('proxies.empty')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('proxies.label')}</th>
                  <th>{t('proxies.product')}</th>
                  <th>{t('proxies.endpoint')}</th>
                  <th>{t('proxies.usage')}</th>
                  <th>{t('proxies.panel')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.totalGb > 0 ? Math.min(100, (r.usedGb / r.totalGb) * 100) : 0;
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="text-bold">{r.label ?? '—'}</div>
                        <Badge tone={r.status === 'ACTIVE' ? 'good' : r.status === 'SUSPENDED' ? 'warn' : 'bad'}>{t(`status.${r.status}`)}</Badge>
                      </td>
                      <td>{r.productName ?? '—'}</td>
                      <td className="mono">{r.host}:{r.port}</td>
                      <td style={{ minWidth: 150 }}>
                        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                        <div className="text-xs text-muted">{fmtNum(r.usedGb, lang)} / {r.totalGb > 0 ? fmtNum(r.totalGb, lang) : '∞'} {t('unit.gb')}</div>
                      </td>
                      <td>
                        {r.imported ? <Badge tone="good" title={r.category ?? ''}>{r.category ?? t('buy.globalPool')}</Badge>
                          : r.importError ? <Badge tone="bad" title={r.importError}>{t('proxies.importFailed')}</Badge>
                          : <Badge>{t('proxies.notImported')}</Badge>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'detail', row: r })}>{t('proxies.details')}</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'add', row: r })}>+ {t('unit.gb')}</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'remove', row: r })}>− {t('unit.gb')}</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: 'import', row: r })}>{r.imported ? t('proxies.move') : t('proxies.import')}</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'delete', row: r })}>{t('proxies.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog?.kind === 'detail' && <DetailDialog row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'add' && <AddDialog row={dialog.row} product={productOf(dialog.row.productId)} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'remove' && <RemoveDialog row={dialog.row} product={productOf(dialog.row.productId)} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'import' && <ImportDialog row={dialog.row} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteDialog row={dialog.row} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

function DetailDialog({ row, onClose }: { row: ProxyRow; onClose: () => void }) {
  const t = useT();
  const { lang } = useAddon();
  const d = useLoad<any>(`proxies/${row.id}`);
  const [copied, setCopied] = useState(false);
  const line = d.data?.proxyList?.[0];
  return (
    <Modal title={row.label ?? row.id} onClose={onClose}>
      {d.loading ? <Loading /> : d.error ? <ErrorBox message={d.error} onRetry={d.reload} /> : (
        <div className="space-y-3">
          <dl className="kv">
            <dt>{t('proxies.product')}</dt><dd>{d.data.productName}</dd>
            <dt>{t('proxies.status')}</dt><dd>{t(`status.${d.data.status}`)}</dd>
            <dt>{t('proxies.country')}</dt><dd>{d.data.country ?? '—'}</dd>
            <dt>{t('proxies.usage')}</dt>
            <dd>{fmtNum(d.data.usage?.usedGb, lang)} / {fmtNum(d.data.usage?.totalGb, lang)} {t('unit.gb')} ({t('proxies.remaining')} {fmtNum(d.data.usage?.remainingGb, lang)})</dd>
            <dt>{t('proxies.threads')}</dt><dd>{d.data.usage?.threadsUsed ?? '—'}</dd>
            <dt>{t('proxies.panel')}</dt><dd>{d.data.imported ? (d.data.category ?? t('buy.globalPool')) : t('proxies.notImported')}</dd>
            <dt>{t('proxies.expires')}</dt><dd>{row.expiresAt ? fmtDate(row.expiresAt, lang) : t('proxies.never')}</dd>
          </dl>
          {line && (
            <div className="codebox">
              <code>{line}</code>
              <button className="btn btn-outline btn-sm" onClick={async () => { setCopied(await copyText(line)); setTimeout(() => setCopied(false), 1500); }}>{copied ? t('copied') : t('copy')}</button>
            </div>
          )}
        </div>
      )}
      <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>{t('close')}</button></div>
    </Modal>
  );
}

function useAction(onDone: (m?: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    setError('');
    try {
      onDone(await fn());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function AddDialog({ row, product, onClose, onDone }: { row: ProxyRow; product?: Product; onClose: () => void; onDone: (m?: string) => void }) {
  const t = useT();
  const api = useApi();
  const [amount, setAmount] = useState(String(product?.minAmount ?? 1));
  const { busy, error, run } = useAction(onDone);
  const unit = product?.priceUnit === 'MB' ? t('unit.mb') : t('unit.gb');
  return (
    <Modal title={t('add.title', { label: row.label ?? row.id })} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        {error && <ErrorBox message={error} />}
        <Field label={`${t('buy.amount')} (${unit})`} hint={product ? t('buy.limits', { min: product.minAmount, max: product.maxAmount ?? '∞', unit }) : undefined}>
          <input className="input" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Notice tone="warn">{t('add.warn')}</Notice>
      </div>
      <div className="modal-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={() => run(async () => (await api.post<{ message: string }>(`proxies/${row.id}/balance`, { action: 'add', amountGb: Number(amount) })).message)}>
          {busy ? t('buy.busy') : t('add.confirm')}
        </button>
      </div>
    </Modal>
  );
}

function RemoveDialog({ row, product, onClose, onDone }: { row: ProxyRow; product?: Product; onClose: () => void; onDone: (m?: string) => void }) {
  const t = useT();
  const api = useApi();
  const { busy, error, run } = useAction(onDone);
  const policy = String(product?.capabilities?.refundPolicy ?? '');
  const unsupported = product?.capabilities?.removeBandwidth === false;
  return (
    <Modal title={t('remove.title', { label: row.label ?? row.id })} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        {error && <ErrorBox message={error} />}
        {unsupported ? <Notice tone="warn">{t('remove.unsupported')}</Notice> : (
          <>
            <p className="text-sm">{t('remove.body')}</p>
            <Notice tone="warn">{policy === 'full' ? t('remove.full') : policy === 'min_1gb' ? t('remove.min1gb') : policy === 'none' ? t('remove.none') : t('remove.unknown')}</Notice>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button className="btn btn-danger" disabled={busy || unsupported} onClick={() => run(async () => (await api.post<{ message: string }>(`proxies/${row.id}/balance`, { action: 'remove' })).message)}>
          {busy ? t('buy.busy') : t('remove.confirm')}
        </button>
      </div>
    </Modal>
  );
}

function ImportDialog({ row, onClose, onDone }: { row: ProxyRow; onClose: () => void; onDone: (m?: string) => void }) {
  const t = useT();
  const api = useApi();
  const cats = useLoad<string[]>('categories');
  const [category, setCategory] = useState(row.category ?? '');
  const { busy, error, run } = useAction(onDone);
  return (
    <Modal title={t('import.title', { label: row.label ?? row.id })} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        {error && <ErrorBox message={error} />}
        <Field label={t('buy.category')} hint={t('buy.categoryHint')}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('buy.globalPool')}</option>
            {cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { await api.post(`proxies/${row.id}/import`, { category: category || null }); return t('import.done'); })}>
          {busy ? t('buy.busy') : t('import.confirm')}
        </button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ row, onClose, onDone }: { row: ProxyRow; onClose: () => void; onDone: (m?: string) => void }) {
  const t = useT();
  const api = useApi();
  const { busy, error, run } = useAction(onDone);
  const [typed, setTyped] = useState('');
  const expected = row.label ?? row.id;
  return (
    <Modal title={t('delete.title', { label: expected })} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        {error && <ErrorBox message={error} />}
        <Notice tone="warn">{t('delete.warn')}</Notice>
        <Field label={t('delete.type', { label: expected })}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button className="btn btn-danger" disabled={busy || typed !== expected} onClick={() => run(async () => {
          const r = await api.del<{ panelRemoved: boolean }>(`proxies/${row.id}`);
          return r.panelRemoved ? t('delete.doneBoth') : t('delete.doneUpstream');
        })}>
          {busy ? t('buy.busy') : t('delete.confirm')}
        </button>
      </div>
    </Modal>
  );
}
