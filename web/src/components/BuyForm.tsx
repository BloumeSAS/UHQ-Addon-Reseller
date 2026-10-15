import { useEffect, useMemo, useState } from 'react';
import { useAddon } from '../context';
import { useT } from '../i18n';
import { useApi, useLoad } from '../lib/api';
import { copyText, fmtMoney, fmtNum } from '../lib/format';
import { ErrorBox, Field, Loading, Notice } from './ui';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  pricePerGb: number;
  priceUnit: 'GB' | 'MB';
  minAmount: number;
  maxAmount: number | null;
  capabilities: { country?: boolean; durationPricing?: boolean; [k: string]: any };
}

interface PurchaseResult {
  proxy: { id: string; label: string; host: string; port: number; username: string; password: string; totalGb: number };
  imported: boolean;
  importError: string | null;
  category: string | null;
  estimatedCost: number | null;
  recovered: boolean;
}

/**
 * Formulaire d'achat d'un proxy UHQ.Monster + import dans une catégorie du panel.
 * Même composant pour la page de l'addon et pour le widget de la page « Pool » (`compact`).
 * Aucun achat sans confirmation explicite du coût.
 */
export function BuyForm({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const t = useT();
  const { lang } = useAddon();
  const api = useApi();
  const products = useLoad<Product[]>('products');
  const cats = useLoad<string[]>('categories');
  const account = useLoad<{ balance: number; resellerDiscountPercent?: number }>('account');

  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [country, setCountry] = useState('');
  const [proxyType, setProxyType] = useState<'rotating' | 'sticky'>('rotating');
  const [days, setDays] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [doImport, setDoImport] = useState(true);
  const [step, setStep] = useState<'form' | 'confirm' | 'busy' | 'done'>('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [copied, setCopied] = useState(false);

  const product = useMemo(() => products.data?.find((p) => p.id === productId) ?? null, [products.data, productId]);

  // Premier produit sélectionné par défaut, quantité minimale pré-remplie.
  useEffect(() => {
    if (!productId && products.data?.length) {
      setProductId(products.data[0].id);
    }
  }, [products.data, productId]);
  useEffect(() => {
    if (product) setAmount(String(product.minAmount || 1));
    setCountry('');
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountNum = Number(amount);
  const discount = Number(account.data?.resellerDiscountPercent ?? 0);
  const estimated =
    product && !product.capabilities?.durationPricing && Number.isFinite(amountNum) && amountNum > 0
      ? Math.round(product.pricePerGb * amountNum * (1 - discount / 100) * 100) / 100
      : null;
  const outOfLimits = !!product && (amountNum < product.minAmount || (product.maxAmount !== null && amountNum > product.maxAmount));
  const tooExpensive = estimated !== null && account.data ? Number(account.data.balance) < estimated : false;
  const valid = !!product && Number.isFinite(amountNum) && amountNum > 0 && !outOfLimits && (!country || /^[A-Za-z]{2}$/.test(country));
  const unit = product?.priceUnit === 'MB' ? t('unit.mb') : t('unit.gb');

  const submit = async () => {
    setStep('busy');
    setError('');
    try {
      const r = await api.post<PurchaseResult>('proxies', {
        productId,
        amountGb: amountNum,
        ...(country ? { country: country.toUpperCase() } : {}),
        ...(proxyType === 'sticky' ? { proxyType } : {}),
        ...(days !== '' ? { expirationDays: Number(days) } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(category ? { category } : {}),
        import: doImport,
      });
      setResult(r);
      setStep('done');
      account.reload();
      onDone?.();
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStep('form');
    }
  };

  if (products.loading && !products.data) return <Loading />;
  if (products.error) return <ErrorBox message={products.error} onRetry={products.reload} />;

  if (step === 'done' && result) {
    const line = `${result.proxy.host}:${result.proxy.port}:${result.proxy.username}:${result.proxy.password}`;
    return (
      <div className="success-box space-y-3">
        <div className="text-bold">✅ {t('buy.done')} — {result.proxy.label}</div>
        {result.recovered && <Notice tone="warn">{t('buy.recovered')}</Notice>}
        <div className="codebox">
          <code>{line}</code>
          <button className="btn btn-outline btn-sm" onClick={async () => { setCopied(await copyText(line)); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
        {result.imported ? (
          <div className="text-sm text-green">{t('buy.imported', { cat: result.category ?? t('buy.globalPool') })}</div>
        ) : doImport ? (
          <Notice tone="warn">{t('buy.importFailed')} {result.importError}</Notice>
        ) : null}
        <button className="btn btn-outline btn-sm" onClick={() => { setStep('form'); setResult(null); }}>{t('buy.another')}</button>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${compact ? 'widget-form' : ''}`}>
      {error && <ErrorBox message={error} />}

      <div className="form-grid">
        <Field label={t('buy.product')}>
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={step !== 'form'}>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.pricePerGb, lang)}/{p.priceUnit === 'MB' ? t('unit.mb') : t('unit.gb')}</option>
            ))}
          </select>
        </Field>
        <Field label={`${t('buy.amount')} (${unit})`} hint={product ? t('buy.limits', { min: product.minAmount, max: product.maxAmount ?? '∞', unit }) : undefined}>
          <input className="input" type="number" min={product?.minAmount ?? 0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={step !== 'form'} />
        </Field>
        {product?.capabilities?.country && (
          <Field label={t('buy.country')} hint={compact ? undefined : t('buy.countryHint')}>
            <input className="input" maxLength={2} placeholder="FR" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} disabled={step !== 'form'} />
          </Field>
        )}
        <Field label={t('buy.category')} hint={compact ? undefined : t('buy.categoryHint')}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={step !== 'form' || !doImport}>
            <option value="">{t('buy.globalPool')}</option>
            {cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {!compact && (
        <details>
          <summary className="text-sm text-muted" style={{ cursor: 'pointer' }}>{t('buy.advanced')}</summary>
          <div className="form-grid mt-3">
            <Field label={t('buy.label')} hint={t('buy.labelHint')}>
              <input className="input" maxLength={64} value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label={t('buy.type')}>
              <select className="input" value={proxyType} onChange={(e) => setProxyType(e.target.value as 'rotating' | 'sticky')}>
                <option value="rotating">{t('buy.rotating')}</option>
                <option value="sticky">{t('buy.sticky')}</option>
              </select>
            </Field>
            <Field label={t('buy.days')} hint={product?.capabilities?.durationPricing ? t('buy.daysPriced') : t('buy.daysHint')}>
              <input className="input" type="number" min={0} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          </div>
        </details>
      )}

      <label className="check">
        <input type="checkbox" checked={doImport} onChange={(e) => setDoImport(e.target.checked)} disabled={step !== 'form'} />
        {t('buy.import')}
      </label>

      {!compact && doImport && <Notice>{t('buy.importNote')}</Notice>}
      {outOfLimits && <div className="text-sm text-red">{t('buy.outOfLimits')}</div>}
      {tooExpensive && <div className="text-sm text-red">{t('buy.lowBalance', { balance: fmtMoney(account.data?.balance, lang) })}</div>}

      {step === 'form' && (
        <div className="flex items-center gap-3 wrap">
          <button className="btn btn-primary" disabled={!valid || tooExpensive} onClick={() => setStep('confirm')}>{t('buy.submit')}</button>
          <span className="text-sm text-muted">
            {estimated !== null ? t('buy.estimated', { cost: fmtMoney(estimated, lang) }) : product?.capabilities?.durationPricing ? t('buy.costDuration') : ''}
            {account.data ? ` · ${t('buy.balance', { balance: fmtMoney(account.data.balance, lang) })}` : ''}
          </span>
        </div>
      )}

      {(step === 'confirm' || step === 'busy') && product && (
        <div className="notice notice-warn space-y-3">
          <div>
            <strong>{t('buy.confirmTitle')}</strong>
            <div className="text-sm">
              {t('buy.confirmBody', { name: product.name, amount: fmtNum(amountNum, lang), unit, cost: estimated !== null ? fmtMoney(estimated, lang) : t('buy.costDurationShort') })}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={step === 'busy'} onClick={submit}>{step === 'busy' ? t('buy.busy') : t('buy.confirm')}</button>
            <button className="btn btn-outline" disabled={step === 'busy'} onClick={() => setStep('form')}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
