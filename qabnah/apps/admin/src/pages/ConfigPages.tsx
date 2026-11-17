import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, Input, Loading, Modal, MoneyInput, PageHeader, Select, Switch, Textarea,
  errorMessage, formatBps, isApiError, useI18n, useToast,
  type DispatchRule, type GeoPolygon, type Items, type LatLng, type OrderType, type Plan, type PlatformSettings, type PricingRule, type PricingRuleInput, type VehicleType, type Zone,
} from '@qabnah/shared';
import { FitBounds, MapView, Marker, Polygon, Tooltip, ZoneLayer, pinIcon, polygonPositions, useMapEvents } from '@qabnah/shared/map';
import { api } from '../api';
import { useSession } from '../session';

const useZones = () => useQuery({ queryKey: ['a', 'zones'], queryFn: () => api.get<Items<Zone>>('/admin/zones') });

/* ───────── Zones ───────── */
type Rect = { sw: LatLng; ne: LatLng };
const rectToPolygon = ({ sw, ne }: Rect): GeoPolygon => ({ type: 'Polygon', coordinates: [[[sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat]]] });
function polygonToRect(p: GeoPolygon | null): Rect | null {
  const ring = p?.coordinates?.[0];
  if (!ring?.length) return null;
  const lngs = ring.map((c) => c[0]), lats = ring.map((c) => c[1]);
  return { sw: { lat: Math.min(...lats), lng: Math.min(...lngs) }, ne: { lat: Math.max(...lats), lng: Math.max(...lngs) } };
}
const isRectangle = (p: GeoPolygon | null) => (p?.coordinates?.[0]?.length ?? 0) <= 5;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

function ClickCorners({ onCorner }: { onCorner: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onCorner({ lat: r6(e.latlng.lat), lng: r6(e.latlng.lng) }) });
  return null;
}

function ZoneEditor({ zone, zones, onClose }: { zone: Zone | null; zones: Zone[]; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ code: zone?.code ?? '', nameEn: zone?.nameEn ?? '', nameAr: zone?.nameAr ?? '', isActive: zone?.isActive ?? true });
  const [rect, setRect] = useState<Rect | null>(polygonToRect(zone?.boundary ?? null));
  const [pending, setPending] = useState<LatLng | null>(null);
  const [geomChanged, setGeomChanged] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, code: f.code.trim().toUpperCase(), nameEn: f.nameEn.trim(), nameAr: f.nameAr.trim(), ...(rect && (geomChanged || !zone) ? { boundary: rectToPolygon(rect) } : {}) };
      return zone ? api.patch<Zone>(`/admin/zones/${zone.id}`, body) : api.post<Zone>('/admin/zones', body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a', 'zones'] }); toast.push(t('common.saved')); onClose(); },
  });
  const corner = (p: LatLng) => {
    if (!pending) { setPending(p); return; }
    setRect({ sw: { lat: Math.min(p.lat, pending.lat), lng: Math.min(p.lng, pending.lng) }, ne: { lat: Math.max(p.lat, pending.lat), lng: Math.max(p.lng, pending.lng) } });
    setGeomChanged(true);
    setPending(null);
  };
  const setCoord = (k: 'sw' | 'ne', axis: 'lat' | 'lng', v: string) => { if (!rect) return; const n = Number(v); if (Number.isFinite(n)) { setRect({ ...rect, [k]: { ...rect[k], [axis]: n } }); setGeomChanged(true); } };
  const fe = isApiError(save.error) ? save.error.fieldErrors : {};
  const valid = /^[A-Z0-9-]{2,30}$/.test(f.code.trim().toUpperCase()) && f.nameEn.trim().length >= 2 && f.nameAr.trim().length >= 2 && !!rect && rect.ne.lat > rect.sw.lat && rect.ne.lng > rect.sw.lng;
  const others = zones.filter((z) => z.id !== zone?.id);
  const cornerIcon = useMemo(() => pinIcon('#F4A300'), []);
  return (
    <Modal open onClose={onClose} wide title={zone ? t('zones.edit', { code: zone.code }) : t('zones.new')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Input label={t('zones.code')} dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} hint="MCT-QURUM" error={fe.code} />
          <Input label={t('common.nameEn')} dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} error={fe.nameEn} />
          <Input label={t('common.nameAr')} dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} error={fe.nameAr} />
        </div>
        <Switch checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={t('common.active')} />
        {zone && !isRectangle(zone.boundary) ? <Alert tone="warning">{t('zones.polygonWarning')}</Alert> : null}
        <p className="text-sm muted">{pending ? t('zones.clickSecond') : t('zones.clickFirst')}</p>
        <MapView height={360} zoom={11}>
          <ZoneLayer zones={others} />
          <ClickCorners onCorner={corner} />
          {rect ? <Polygon positions={polygonPositions(rectToPolygon(rect))} pathOptions={{ color: '#F4A300', weight: 3, fillOpacity: 0.15 }} /> : null}
          {pending ? <Marker position={[pending.lat, pending.lng]} icon={cornerIcon}><Tooltip permanent>1</Tooltip></Marker> : null}
          <FitBounds points={rect ? [rect.sw, rect.ne] : others.flatMap((z) => polygonToRect(z.boundary) ? [polygonToRect(z.boundary)!.sw, polygonToRect(z.boundary)!.ne] : [])} fitKey={zone?.id ?? 'new'} maxZoom={14} />
        </MapView>
        {rect ? (
          <div className="form-grid">
            <Input label={t('zones.south')} type="number" step="0.0001" dir="ltr" value={rect.sw.lat} onChange={(e) => setCoord('sw', 'lat', e.target.value)} />
            <Input label={t('zones.west')} type="number" step="0.0001" dir="ltr" value={rect.sw.lng} onChange={(e) => setCoord('sw', 'lng', e.target.value)} />
            <Input label={t('zones.north')} type="number" step="0.0001" dir="ltr" value={rect.ne.lat} onChange={(e) => setCoord('ne', 'lat', e.target.value)} />
            <Input label={t('zones.east')} type="number" step="0.0001" dir="ltr" value={rect.ne.lng} onChange={(e) => setCoord('ne', 'lng', e.target.value)} />
          </div>
        ) : null}
        {save.isError ? <Alert tone="danger">{errorMessage(save.error, t)}</Alert> : null}
      </div>
    </Modal>
  );
}

export function ZonesPage() {
  const { t, pick } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useZones();
  const [editing, setEditing] = useState<Zone | 'new' | null>(null);
  const [hi, setHi] = useState<string | null>(null);
  const manage = can('zones:manage');
  const toggle = useMutation({ mutationFn: (z: Zone) => api.patch(`/admin/zones/${z.id}`, { isActive: !z.isActive }), onSuccess: () => qc.invalidateQueries({ queryKey: ['a', 'zones'] }), onError: (e) => toast.push(errorMessage(e, t), 'danger') });
  return (
    <>
      <PageHeader title={t('nav.zones')} description={t('zones.hint')} actions={manage ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>{t('zones.new')}</Button> : null} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card flush>
            <MapView height={520} zoom={11}>
              <ZoneLayer zones={q.data!.items} highlightId={hi} />
              <FitBounds points={q.data!.items.flatMap((z) => { const r = polygonToRect(z.boundary); return r ? [r.sw, r.ne] : []; })} fitKey="all" />
            </MapView>
          </Card>
          <Card flush title={t('zones.list')}>
            {!q.data!.items.length ? <EmptyState icon="pin" title={t('zones.empty')} /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>{t('zones.code')}</th><th>{t('common.name')}</th><th>{t('common.status')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
                <tbody>{q.data!.items.map((z) => (
                  <tr key={z.id} onMouseEnter={() => setHi(z.id)} onMouseLeave={() => setHi(null)} className={hi === z.id ? 'selected' : ''}>
                    <td className="mono">{z.code}</td><td>{pick(z.nameEn, z.nameAr)}</td>
                    <td><Switch checked={z.isActive} disabled={!manage || toggle.isPending} onChange={() => toggle.mutate(z)} label={z.isActive ? t('common.active') : t('common.inactive')} /></td>
                    <td>{manage ? <Button size="sm" onClick={() => setEditing(z)}>{t('common.edit')}</Button> : null}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}
      {editing ? <ZoneEditor zone={editing === 'new' ? null : editing} zones={q.data?.items ?? []} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

/* ───────── Pricing ───────── */
export function computeFee(r: Pick<PricingRule, 'baseFeeBaisa' | 'perKmBaisa' | 'includedKm' | 'minFeeBaisa' | 'maxFeeBaisa' | 'surgeMultiplier'>, distanceM: number) {
  const km = distanceM / 1000;
  let fee = r.baseFeeBaisa + r.perKmBaisa * Math.max(0, km - r.includedKm);
  fee = Math.max(fee, r.minFeeBaisa) * r.surgeMultiplier;
  if (r.maxFeeBaisa != null) fee = Math.min(fee, r.maxFeeBaisa);
  return Math.round(Math.round(fee) / 10) * 10;
}

const emptyRule = (): PricingRuleInput => ({ name: '', zoneId: null, deliveryType: null, vehicleType: null, baseFeeBaisa: 500, perKmBaisa: 100, includedKm: 2, minFeeBaisa: 500, maxFeeBaisa: null, maxDistanceKm: 40, surgeMultiplier: 1, captainShareBps: 8000, priority: 0, isActive: true });

function RuleEditor({ rule, zones, onClose }: { rule: PricingRule | null; zones: Zone[]; onClose: () => void }) {
  const { t, money, num, pick } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [r, setR] = useState<PricingRuleInput>(rule ? { ...rule } : emptyRule());
  const [km, setKm] = useState('5');
  const save = useMutation({
    mutationFn: () => (rule ? api.patch(`/admin/pricing-rules/${rule.id}`, r) : api.post('/admin/pricing-rules', r)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a', 'pricing'] }); toast.push(t('common.saved')); onClose(); },
  });
  const fe = isApiError(save.error) ? save.error.fieldErrors : {};
  const set = <K extends keyof PricingRuleInput>(k: K, v: PricingRuleInput[K]) => setR({ ...r, [k]: v });
  const numIn = (k: 'includedKm' | 'maxDistanceKm' | 'surgeMultiplier' | 'priority', label: string, step = '0.1') => (
    <Input label={label} type="number" step={step} value={r[k]} onChange={(e) => set(k, Number(e.target.value))} error={fe[k]} />
  );
  const fee = computeFee(r, Number(km) * 1000);
  return (
    <Modal open onClose={onClose} wide title={rule ? t('pricing.edit') : t('pricing.new')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={save.isPending} disabled={r.name.trim().length < 2} onClick={() => save.mutate()}>{t('common.save')}</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Input label={t('common.name')} value={r.name} onChange={(e) => set('name', e.target.value)} error={fe.name} />
          <Select label={t('pricing.zone')} value={r.zoneId ?? ''} onChange={(e) => set('zoneId', e.target.value || null)} placeholder={t('pricing.anyZone')} options={zones.map((z) => ({ value: z.id, label: `${z.code} · ${pick(z.nameEn, z.nameAr)}` }))} />
          <Select label={t('pricing.type')} value={r.deliveryType ?? ''} onChange={(e) => set('deliveryType', (e.target.value || null) as OrderType | null)} placeholder={t('pricing.anyType')} options={(['marketplace', 'merchant_delivery', 'c2c'] as const).map((x) => ({ value: x, label: t(`order.type.${x}`) }))} />
          <Select label={t('pricing.vehicle')} value={r.vehicleType ?? ''} onChange={(e) => set('vehicleType', (e.target.value || null) as VehicleType | null)} placeholder={t('pricing.anyVehicle')} options={(['bike', 'car', 'van'] as const).map((x) => ({ value: x, label: t(`vehicle.${x}`) }))} />
          <MoneyInput label={t('pricing.base')} valueBaisa={r.baseFeeBaisa} onChangeBaisa={(b) => set('baseFeeBaisa', b ?? 0)} error={fe.baseFeeBaisa} />
          <MoneyInput label={t('pricing.perKm')} valueBaisa={r.perKmBaisa} onChangeBaisa={(b) => set('perKmBaisa', b ?? 0)} error={fe.perKmBaisa} />
          {numIn('includedKm', t('pricing.includedKm'))}
          <MoneyInput label={t('pricing.min')} valueBaisa={r.minFeeBaisa} onChangeBaisa={(b) => set('minFeeBaisa', b ?? 0)} />
          <MoneyInput label={t('pricing.max')} valueBaisa={r.maxFeeBaisa} onChangeBaisa={(b) => set('maxFeeBaisa', b)} optional />
          {numIn('maxDistanceKm', t('pricing.maxDistance'), '1')}
          {numIn('surgeMultiplier', t('pricing.surge'))}
          <Input label={t('pricing.captainShare')} type="number" step="1" min={0} max={100} suffix="%" value={r.captainShareBps / 100} onChange={(e) => set('captainShareBps', Math.round(Number(e.target.value) * 100))} error={fe.captainShareBps} />
          {numIn('priority', t('pricing.priority'), '1')}
        </div>
        <Switch checked={r.isActive} onChange={(v) => set('isActive', v)} label={t('common.active')} />
        <Card title={t('pricing.calculator')}>
          <div className="row">
            <Input label={t('pricing.distance')} type="number" min={0} step="0.5" suffix="km" value={km} onChange={(e) => setKm(e.target.value)} />
            <div className="stack stack-sm">
              <span className="kpi__label">{t('pricing.fee')}</span>
              <span className="kpi__value" data-testid="calc-fee">{money(fee)}</span>
              <span className="text-xs muted">{t('pricing.captainGets', { amount: money(Math.round((fee * r.captainShareBps) / 10000)) })}{Number(km) > r.maxDistanceKm ? ` · ${t('pricing.tooFar', { km: num(r.maxDistanceKm, 0) })}` : ''}</span>
            </div>
          </div>
          <p className="text-xs muted">{t('pricing.formula')}</p>
        </Card>
        {save.isError ? <Alert tone="danger">{errorMessage(save.error, t)}</Alert> : null}
      </div>
    </Modal>
  );
}

export function PricingPage() {
  const { t, money, num } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const zones = useZones();
  const q = useQuery({ queryKey: ['a', 'pricing'], queryFn: () => api.get<Items<PricingRule>>('/admin/pricing-rules') });
  const [editing, setEditing] = useState<PricingRule | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PricingRule | null>(null);
  const del = useMutation({ mutationFn: (r: PricingRule) => api.delete(`/admin/pricing-rules/${r.id}`), onSuccess: () => { setToDelete(null); void qc.invalidateQueries({ queryKey: ['a', 'pricing'] }); } });
  const manage = can('pricing:manage');
  const zoneName = (id: string | null) => { const z = zones.data?.items.find((x) => x.id === id); return z ? z.code : t('pricing.anyZone'); };
  return (
    <>
      <PageHeader title={t('nav.pricing')} description={t('pricing.hint')} actions={manage ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>{t('pricing.new')}</Button> : null} />
      <Card flush>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="wallet" title={t('pricing.empty')} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('pricing.scope')}</th><th className="num">{t('pricing.base')}</th><th className="num">{t('pricing.perKm')}</th><th className="num">{t('pricing.min')}</th><th>{t('pricing.surge')}</th><th>{t('pricing.captainShare')}</th><th>{t('pricing.at5km')}</th><th>{t('common.status')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>{q.data.items.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.name}<div className="text-xs muted">{t('pricing.priority')} {num(r.priority, 0)}</div></td>
                <td className="text-sm">{zoneName(r.zoneId)} · {r.deliveryType ? t(`order.type.${r.deliveryType}`) : t('pricing.anyType')} · {r.vehicleType ? t(`vehicle.${r.vehicleType}`) : t('pricing.anyVehicle')}</td>
                <td className="num">{money(r.baseFeeBaisa)}</td><td className="num">{money(r.perKmBaisa)}</td><td className="num">{money(r.minFeeBaisa)}</td>
                <td>×{num(r.surgeMultiplier, 2)}</td><td>{formatBps(r.captainShareBps)}</td><td className="strong">{money(computeFee(r, 5000))}</td>
                <td>{r.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</td>
                <td>{manage ? <div className="row row-nowrap"><Button size="sm" onClick={() => setEditing(r)}>{t('common.edit')}</Button><Button size="sm" variant="ghost" iconOnly icon="trash" aria-label={t('common.delete')} onClick={() => setToDelete(r)} /></div> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {editing ? <RuleEditor rule={editing === 'new' ? null : editing} zones={zones.data?.items ?? []} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={!!toDelete} tone="danger" title={t('pricing.deleteTitle')} message={toDelete?.name ?? ''} confirmLabel={t('common.delete')}
        loading={del.isPending} error={del.isError ? errorMessage(del.error, t) : null} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete)} />
    </>
  );
}

/* ───────── Dispatch rules ───────── */
const defaultDispatch = (zoneId: string | null): DispatchRule => ({ zoneId, strategy: 'sequential', autoDispatch: true, dispatchOnAccept: true, searchRadiusKm: 3, radiusStepKm: 2, maxRadiusKm: 10, maxRounds: 5, broadcastSize: 3, offerTimeoutS: 30, locationMaxAgeS: 120, respectSchedule: false, bikeBlackout: [], weightDistance: 0.6, weightRating: 0.2, weightAcceptance: 0.2 });

function DispatchForm({ rule, zones, onSaved }: { rule: DispatchRule; zones: Zone[]; onSaved: () => void }) {
  const { t, pick } = useI18n();
  const { can } = useSession();
  const toast = useToast();
  const [r, setR] = useState<DispatchRule>(rule);
  const [blackout, setBlackout] = useState(JSON.stringify(rule.bikeBlackout ?? [], null, 1));
  useEffect(() => { setR(rule); setBlackout(JSON.stringify(rule.bikeBlackout ?? [], null, 1)); }, [rule]);
  let parsedBlackout: DispatchRule['bikeBlackout'] | null = null;
  try { const v = JSON.parse(blackout || '[]'); parsedBlackout = Array.isArray(v) ? v : null; } catch { parsedBlackout = null; }
  const save = useMutation({ mutationFn: () => api.put<DispatchRule>('/admin/dispatch-rules', { ...r, bikeBlackout: parsedBlackout ?? [] }), onSuccess: () => { toast.push(t('common.saved')); onSaved(); } });
  const fe = isApiError(save.error) ? save.error.fieldErrors : {};
  const n = (k: keyof DispatchRule, label: string, step = '1', hint?: string) => (
    <Input label={label} type="number" step={step} value={r[k] as number} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} error={fe[k]} hint={hint} />
  );
  const zone = zones.find((z) => z.id === r.zoneId);
  const manage = can('dispatch_rules:manage');
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (parsedBlackout) save.mutate(); }}>
      <Card title={zone ? `${zone.code} · ${pick(zone.nameEn, zone.nameAr)}` : t('dispatch.global')} footer={manage ? <Button type="submit" variant="primary" loading={save.isPending} disabled={!parsedBlackout}>{t('common.save')}</Button> : undefined}>
        <fieldset disabled={!manage} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <Select label={t('dispatch.strategy')} value={r.strategy} onChange={(e) => setR({ ...r, strategy: e.target.value as DispatchRule['strategy'] })} options={(['sequential', 'broadcast', 'manual'] as const).map((s) => ({ value: s, label: t(`dispatch.strategy.${s}`) }))} />
            {n('searchRadiusKm', t('dispatch.searchRadius'), '0.5')}{n('radiusStepKm', t('dispatch.radiusStep'), '0.5')}{n('maxRadiusKm', t('dispatch.maxRadius'), '0.5')}
            {n('maxRounds', t('dispatch.maxRounds'))}{n('broadcastSize', t('dispatch.broadcastSize'))}{n('offerTimeoutS', t('dispatch.offerTimeout'))}{n('locationMaxAgeS', t('dispatch.locationMaxAge'))}
            {n('weightDistance', t('dispatch.wDistance'), '0.05')}{n('weightRating', t('dispatch.wRating'), '0.05')}{n('weightAcceptance', t('dispatch.wAcceptance'), '0.05')}
          </div>
          <div className="row" style={{ ['--gap' as string]: '24px' }}>
            <Checkbox checked={r.autoDispatch} onChange={(v) => setR({ ...r, autoDispatch: v })} label={t('dispatch.auto')} />
            <Checkbox checked={r.dispatchOnAccept} onChange={(v) => setR({ ...r, dispatchOnAccept: v })} label={t('dispatch.onAccept')} />
            <Checkbox checked={r.respectSchedule} onChange={(v) => setR({ ...r, respectSchedule: v })} label={t('dispatch.respectSchedule')} />
          </div>
          <Textarea label={t('dispatch.blackout')} dir="ltr" className="mono" rows={3} value={blackout} onChange={(e) => setBlackout(e.target.value)} hint={t('dispatch.blackoutHint')} error={!parsedBlackout ? t('dispatch.jsonInvalid') : fe.bikeBlackout} />
          {save.isError ? <Alert tone="danger">{errorMessage(save.error, t)}</Alert> : null}
        </fieldset>
      </Card>
    </form>
  );
}

export function DispatchPage() {
  const { t, pick } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const zones = useZones();
  const q = useQuery({ queryKey: ['a', 'dispatch'], queryFn: () => api.get<Items<DispatchRule>>('/admin/dispatch-rules') });
  const [newZone, setNewZone] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rules = q.data.items;
  const global = rules.find((r) => r.zoneId === null) ?? defaultDispatch(null);
  const zoneRules = [...rules.filter((r) => r.zoneId), ...extra.filter((z) => !rules.some((r) => r.zoneId === z)).map((z) => ({ ...global, zoneId: z }))];
  const available = (zones.data?.items ?? []).filter((z) => !zoneRules.some((r) => r.zoneId === z.id));
  const saved = () => qc.invalidateQueries({ queryKey: ['a', 'dispatch'] });
  return (
    <>
      <PageHeader title={t('nav.dispatch')} description={t('dispatch.hint')} />
      <DispatchForm rule={global} zones={zones.data?.items ?? []} onSaved={saved} />
      <h2>{t('dispatch.perZone')}</h2>
      {zoneRules.length === 0 ? <p className="muted">{t('dispatch.noZoneRules')}</p> : zoneRules.map((r) => <DispatchForm key={r.zoneId} rule={r} zones={zones.data?.items ?? []} onSaved={saved} />)}
      {can('dispatch_rules:manage') && available.length ? (
        <div className="row">
          <Select aria-label={t('dispatch.addZone')} value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder={t('dispatch.chooseZone')} options={available.map((z) => ({ value: z.id, label: `${z.code} · ${pick(z.nameEn, z.nameAr)}` }))} />
          <Button icon="plus" disabled={!newZone} onClick={() => { setExtra([...extra, newZone]); setNewZone(''); }}>{t('dispatch.addZone')}</Button>
        </div>
      ) : null}
    </>
  );
}

/* ───────── Settings ───────── */
const CAPTAIN_DOCS = ['national_id', 'driving_license', 'vehicle_registration', 'vehicle_insurance', 'profile_photo', 'police_clearance'];

export function SettingsPage() {
  const { t } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['a', 'settings'], queryFn: () => api.get<PlatformSettings>('/admin/settings') });
  const [s, setS] = useState<PlatformSettings | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  const save = useMutation({ mutationFn: (body: PlatformSettings) => api.put<PlatformSettings>('/admin/settings', body), onSuccess: (d) => { qc.setQueryData(['a', 'settings'], d); toast.push(t('common.saved')); } });
  if (q.isLoading || !s) return q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Loading />;
  const manage = can('settings:manage');
  const fe = isApiError(save.error) ? save.error.fieldErrors : {};
  const num = (k: keyof PlatformSettings, label: string, hint?: string, suffix?: string) => <Input label={label} type="number" value={s[k] as number} suffix={suffix} hint={hint} error={fe[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(s); }} className="stack stack-lg">
      <PageHeader title={t('nav.settings')} description={t('settings.hint')} actions={manage ? <Button type="submit" variant="primary" loading={save.isPending}>{t('common.save')}</Button> : null} />
      {!manage ? <Alert tone="info">{t('settings.readOnly')}</Alert> : null}
      {save.isError ? <Alert tone="danger">{errorMessage(save.error, t)}</Alert> : null}
      <fieldset disabled={!manage} className="grid grid-2" style={{ border: 0, padding: 0, margin: 0, alignItems: 'start' }}>
        <Card title={t('settings.money')}>
          <div className="form-grid">
            <Input label={t('settings.vat')} type="number" step="0.01" suffix="%" value={s.vatRateBps / 100} onChange={(e) => setS({ ...s, vatRateBps: Math.round(Number(e.target.value) * 100) })} />
            <Input label={t('settings.defaultCommission')} type="number" step="0.01" suffix="%" value={s.defaultCommissionBps / 100} onChange={(e) => setS({ ...s, defaultCommissionBps: Math.round(Number(e.target.value) * 100) })} />
            <MoneyInput label={t('settings.serviceFee')} valueBaisa={s.serviceFeeBaisa} onChangeBaisa={(b) => setS({ ...s, serviceFeeBaisa: b ?? 0 })} />
            <MoneyInput label={t('settings.codMax')} valueBaisa={s.codMaxBaisa} onChangeBaisa={(b) => setS({ ...s, codMaxBaisa: b ?? 0 })} />
            <MoneyInput label={t('settings.captainCashLimit')} valueBaisa={s.captainCashLimitBaisa} onChangeBaisa={(b) => setS({ ...s, captainCashLimitBaisa: b ?? 0 })} />
          </div>
        </Card>
        <Card title={t('settings.operations')}>
          <div className="stack">
            <div className="form-grid">
              {num('merchantAcceptTimeoutMinutes', t('settings.acceptTimeout'), t('settings.acceptTimeoutHint'), 'min')}
              {num('pendingPaymentTimeoutMinutes', t('settings.paymentTimeout'), undefined, 'min')}
              <Input label={t('settings.supportPhone')} type="tel" dir="ltr" value={s.supportPhone} onChange={(e) => setS({ ...s, supportPhone: e.target.value })} />
            </div>
            <Switch checked={s.requireFleetForNonOmani} onChange={(v) => setS({ ...s, requireFleetForNonOmani: v })} label={t('settings.requireFleet')} description={t('settings.requireFleetHint')} />
            {num('captainDocumentExpiryNoticeDays', t('settings.expiryNotice'), t('settings.expiryNoticeHint'), 'days')}
            <div className="field"><span className="field__label">{t('settings.requiredDocs')}</span>
              {CAPTAIN_DOCS.map((d) => <Checkbox key={d} checked={s.requiredCaptainDocuments.includes(d)} label={t(`capDoc.${d}`)}
                onChange={(v) => setS({ ...s, requiredCaptainDocuments: v ? [...s.requiredCaptainDocuments, d] : s.requiredCaptainDocuments.filter((x) => x !== d) })} />)}
            </div>
          </div>
        </Card>
        <Card title={t('settings.invoice')}>
          <div className="stack">
            <p className="text-sm muted">{t('settings.invoiceHint')}</p>
            <div className="form-grid">
              <Input label={t('settings.legalName')} value={s.platformLegalName ?? ''} maxLength={200} error={fe.platformLegalName} onChange={(e) => setS({ ...s, platformLegalName: e.target.value })} />
              <Input label={t('settings.crNumber')} dir="ltr" value={s.platformCrNumber ?? ''} maxLength={40} error={fe.platformCrNumber} onChange={(e) => setS({ ...s, platformCrNumber: e.target.value })} optional />
              <Input label={t('settings.vatNumber')} dir="ltr" value={s.platformVatNumber ?? ''} maxLength={40} error={fe.platformVatNumber} onChange={(e) => setS({ ...s, platformVatNumber: e.target.value })} optional />
              <Textarea label={t('settings.address')} rows={2} value={s.platformAddress ?? ''} maxLength={300} error={fe.platformAddress} onChange={(e) => setS({ ...s, platformAddress: e.target.value })} fieldClassName="span-all" />
            </div>
          </div>
        </Card>
      </fieldset>
    </form>
  );
}

/* ───────── Plans ───────── */
export function PlansPage() {
  const { t, money, pick } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['a', 'plans'], queryFn: () => api.get<Items<Plan>>('/admin/plans') });
  const [edit, setEdit] = useState<(Omit<Plan, 'id'> & { id?: string; featuresText: string }) | null>(null);
  let features: Record<string, unknown> | null = null;
  try { features = edit ? JSON.parse(edit.featuresText || '{}') : null; } catch { features = null; }
  const save = useMutation({
    mutationFn: () => {
      const { id, featuresText: _ft, ...rest } = edit!;
      void _ft;
      const body = { ...rest, features: features ?? {} };
      return id ? api.patch(`/admin/plans/${id}`, body) : api.post('/admin/plans', body);
    },
    onSuccess: () => { setEdit(null); void qc.invalidateQueries({ queryKey: ['a', 'plans'] }); toast.push(t('common.saved')); },
  });
  const fe = isApiError(save.error) ? save.error.fieldErrors : {};
  const manage = can('plans:manage');
  return (
    <>
      <PageHeader title={t('nav.plans')} description={t('plans.hint')} actions={manage ? <Button variant="primary" icon="plus" onClick={() => { save.reset(); setEdit({ code: '', nameEn: '', nameAr: '', monthlyFeeBaisa: 0, commissionBps: 1000, features: {}, isActive: true, featuresText: '{\n "whatsapp": true\n}' }); }}>{t('plans.new')}</Button> : null} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="grid grid-3">
          {q.data!.items.map((p) => (
            <Card key={p.id} title={pick(p.nameEn, p.nameAr)} actions={manage ? <Button size="sm" onClick={() => { save.reset(); setEdit({ ...p, featuresText: JSON.stringify(p.features ?? {}, null, 1) }); }}>{t('common.edit')}</Button> : null}>
              <div className="stack stack-sm">
                <div className="row between"><span className="kpi__value">{money(p.monthlyFeeBaisa)}</span><span className="muted">{t('plans.perMonth')}</span></div>
                <div>{t('plans.commission')}: <strong>{formatBps(p.commissionBps)}</strong></div>
                <div className="row">{Object.entries(p.features ?? {}).map(([k, v]) => <Badge key={k} tone={v ? 'success' : 'neutral'}>{k}{v === true ? ' ✓' : v === false ? ' ✗' : `: ${String(v)}`}</Badge>)}</div>
                <div className="row between"><span className="mono text-xs">{p.code}</span>{p.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit ? (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? t('plans.edit') : t('plans.new')}
          footer={<><Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={save.isPending} disabled={!features} onClick={() => save.mutate()}>{t('common.save')}</Button></>}>
          <div className="form-grid">
            <Input label={t('plans.code')} dir="ltr" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} error={fe.code} hint="growth" />
            <Input label={t('common.nameEn')} dir="ltr" value={edit.nameEn} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} error={fe.nameEn} />
            <Input label={t('common.nameAr')} dir="rtl" value={edit.nameAr} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} error={fe.nameAr} />
            <MoneyInput label={t('plans.monthlyFee')} valueBaisa={edit.monthlyFeeBaisa} onChangeBaisa={(b) => setEdit({ ...edit, monthlyFeeBaisa: b ?? 0 })} />
            <Input label={t('plans.commission')} type="number" step="0.01" suffix="%" value={edit.commissionBps / 100} onChange={(e) => setEdit({ ...edit, commissionBps: Math.round(Number(e.target.value) * 100) })} error={fe.commissionBps} />
            <Switch checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label={t('common.active')} />
            <Textarea label={t('plans.features')} dir="ltr" className="mono" rows={4} fieldClassName="span-all" value={edit.featuresText} onChange={(e) => setEdit({ ...edit, featuresText: e.target.value })} error={!features ? t('dispatch.jsonInvalid') : null} />
            {save.isError ? <div className="span-all"><Alert tone="danger">{errorMessage(save.error, t)}</Alert></div> : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
