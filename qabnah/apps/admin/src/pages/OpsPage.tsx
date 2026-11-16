import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Alert, Badge, Button, Drawer, EmptyState, ErrorState, Loading, StatusBadge, errorMessage, formatDistance, useI18n, useNow, useRealtimeChannel, useToast,
  type AdminDeliveryDetail, type Items, type LatLng, type LiveCaptain, type LiveDelivery, type LiveOps, type Zone,
} from '@qabnah/shared';
import { DROPOFF_COLOR, FitBounds, MapView, Marker, PICKUP_COLOR, Polyline, Tooltip, ZoneLayer, captainIcon, pinIcon } from '@qabnah/shared/map';
import { api, realtime } from '../api';
import { useSession } from '../session';

const LIVE_KEY = ['a', 'live'] as const;

export function haversineM(a: LatLng, b: LatLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function DeliveryPanel({ id, captains, onClose }: { id: string | null; captains: LiveCaptain[]; onClose: () => void }) {
  const { t, money, dateTime, time, lang, num } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [pick, setPick] = useState('');
  const q = useQuery({ queryKey: ['a', 'delivery', id], queryFn: () => api.get<AdminDeliveryDetail>(`/admin/deliveries/${id}`), enabled: !!id, refetchInterval: 10_000 });
  const d = q.data;
  const refresh = () => { void qc.invalidateQueries({ queryKey: LIVE_KEY }); void qc.invalidateQueries({ queryKey: ['a', 'delivery', id] }); };
  const assign = useMutation({ mutationFn: (captainId: string) => api.post(`/admin/deliveries/${id}/assign`, { captainId }), onSuccess: () => { setPick(''); refresh(); toast.push(t('ops.assigned')); } });
  const redispatch = useMutation({ mutationFn: () => api.post(`/admin/deliveries/${id}/redispatch`), onSuccess: () => { refresh(); toast.push(t('ops.redispatched')); } });
  const nearest = useMemo(() => {
    const p = d?.pickup.location;
    return captains.map((c) => ({ c, dist: p ? haversineM(p, c.location) : 0 })).sort((a, b) => a.dist - b.dist);
  }, [captains, d]);
  const reassignable = d && ['created', 'searching', 'unassigned', 'assigned', 'at_pickup'].includes(d.status);
  const pts = d ? [d.pickup.location, d.dropoff.location, d.captain?.location ?? null].filter((x): x is LatLng => !!x) : [];
  return (
    <Drawer open={!!id} onClose={onClose} title={d ? t('ops.delivery') : t('common.loading')} subtitle={d ? <Link to={`/orders/${d.orderId}`}>{t('ops.openOrder')}</Link> : undefined}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d ? (
        <>
          <div className="row"><StatusBadge kind="delivery" status={d.status} /><Badge>{t('ops.round', { n: num(d.dispatchRound, 0) })}</Badge>{d.currentRadiusKm ? <Badge>{num(d.currentRadiusKm, 1)} km</Badge> : null}</div>
          <MapView height={220} center={pts[0]}>
            <FitBounds points={pts} fitKey={d.id} />
            {d.pickup.location ? <Marker position={[d.pickup.location.lat, d.pickup.location.lng]} icon={pinIcon(PICKUP_COLOR)} /> : null}
            {d.dropoff.location ? <Marker position={[d.dropoff.location.lat, d.dropoff.location.lng]} icon={pinIcon(DROPOFF_COLOR)} /> : null}
            {d.track.length ? <Polyline positions={d.track.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#0E7C66' }} /> : null}
            {d.captain?.location ? <Marker position={[d.captain.location.lat, d.captain.location.lng]} icon={captainIcon(true, d.captain.firstName[0])} /> : null}
          </MapView>
          <dl className="dl">
            <dt>{t('ops.pickup')}</dt><dd>{d.pickup.address}</dd>
            <dt>{t('ops.dropoff')}</dt><dd>{d.dropoff.address}<div className="text-xs muted">{d.dropoff.contactName} <span className="ltr">{d.dropoff.contactPhone}</span></div></dd>
            <dt>{t('ops.fee')}</dt><dd>{money(d.feeBaisa)} · {formatDistance(d.distanceM, lang)}</dd>
            {d.codAmountBaisa ? <><dt>{t('ops.cod')}</dt><dd>{money(d.codAmountBaisa)}</dd></> : null}
            <dt>{t('ops.captain')}</dt><dd>{d.captain ? `${d.captain.firstName} · ${t(`vehicle.${d.captain.vehicleType}`)} ${d.captain.vehiclePlate ?? ''}` : '—'}</dd>
            {d.etaDropoffAt ? <><dt>{t('ops.eta')}</dt><dd>{time(d.etaDropoffAt)}</dd></> : null}
          </dl>
          {can('deliveries:dispatch') && reassignable ? (
            <section className="stack stack-sm" aria-labelledby="assign-h">
              <h3 id="assign-h">{t('ops.manualAssign')}</h3>
              {!nearest.length ? <p className="text-sm muted">{t('ops.noOnline')}</p> : (
                <div className="stack stack-sm" role="radiogroup" aria-label={t('ops.manualAssign')}>
                  {nearest.slice(0, 8).map(({ c, dist }) => (
                    <label key={c.id} className={`option-row ${pick === c.id ? 'option-row--on' : ''}`}>
                      <input type="radio" name="cap" checked={pick === c.id} onChange={() => setPick(c.id)} />
                      <span className="grow">{c.fullName} <span className="text-xs muted">· {t(`vehicle.${c.vehicleType}`)}</span></span>
                      <Badge tone={c.activeDeliveries ? 'warning' : 'success'}>{c.activeDeliveries ? t('ops.busyN', { n: c.activeDeliveries }) : t('ops.free')}</Badge>
                      <span className="text-sm num">{formatDistance(dist, lang)}</span>
                    </label>
                  ))}
                </div>
              )}
              {assign.isError ? <Alert tone="danger">{errorMessage(assign.error, t)}</Alert> : null}
              <div className="row">
                <Button variant="primary" disabled={!pick} loading={assign.isPending} onClick={() => assign.mutate(pick)}>{d.captain ? t('ops.reassign') : t('ops.assign')}</Button>
                {['unassigned', 'created'].includes(d.status) ? <Button loading={redispatch.isPending} icon="refresh" onClick={() => redispatch.mutate()}>{t('ops.redispatch')}</Button> : null}
              </div>
              {redispatch.isError ? <Alert tone="danger">{errorMessage(redispatch.error, t)}</Alert> : null}
            </section>
          ) : null}
          <section className="stack stack-sm">
            <h3>{t('ops.offers')}</h3>
            {!d.offers.length ? <p className="text-sm muted">—</p> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>{t('ops.captain')}</th><th>{t('common.status')}</th><th>{t('ops.distance')}</th><th>{t('ops.at')}</th></tr></thead>
                <tbody>{d.offers.map((o) => <tr key={o.id}><td>{o.captainName}</td><td><StatusBadge kind="raw" status={o.status} /></td><td>{formatDistance(o.distanceToPickupM, lang)}</td><td className="nowrap">{time(o.offeredAt)}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
          <section className="stack stack-sm">
            <h3>{t('ops.events')}</h3>
            <ol className="timeline">{d.events.map((e, i) => <li key={i}><span className="strong">{e.type}</span>{e.to ? ` → ${t(`delivery.status.${e.to}`)}` : ''} · <span className="muted">{dateTime(e.at)}</span></li>)}</ol>
          </section>
          {d.proof ? (
            <section className="stack stack-sm">
              <h3>{t('ops.proof')}</h3>
              <dl className="dl">
                <dt>{t('ops.recipient')}</dt><dd>{d.proof.recipientName ?? '—'}</dd>
                <dt>{t('ops.pinVerified')}</dt><dd>{d.proof.pinVerified ? t('common.yes') : t('common.no')}</dd>
                {d.proof.codCollectedBaisa != null ? <><dt>{t('ops.cod')}</dt><dd>{money(d.proof.codCollectedBaisa)}</dd></> : null}
              </dl>
              {d.proof.photoUrl ? <img src={d.proof.photoUrl} alt={t('ops.proof')} style={{ borderRadius: 12, maxHeight: 240, objectFit: 'cover' }} /> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}

export function OpsPage() {
  const { t, money, num, relative } = useI18n();
  const qc = useQueryClient();
  useNow(20_000);
  const [selected, setSelected] = useState<string | null>(null);
  const live = useQuery({ queryKey: LIVE_KEY, queryFn: () => api.get<LiveOps>('/admin/operations/live'), refetchInterval: 10_000 });
  const zones = useQuery({ queryKey: ['a', 'zones'], queryFn: () => api.get<Items<Zone>>('/admin/zones'), staleTime: 5 * 60_000 });
  useRealtimeChannel(realtime, 'admin:ops', (e) => {
    if (e.event === 'captain.location') {
      const p = e.data as { captainId: string; lat: number; lng: number; activeDeliveries: number };
      qc.setQueryData<LiveOps>(LIVE_KEY, (old) => old ? { ...old, captains: old.captains.map((c) => (c.id === p.captainId ? { ...c, location: { lat: p.lat, lng: p.lng }, activeDeliveries: p.activeDeliveries, updatedAt: new Date().toISOString() } : c)) } : old);
    } else {
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
    }
  });
  const d = live.data;
  const queue = d?.deliveries.filter((x) => ['created', 'searching', 'unassigned'].includes(x.status)) ?? [];
  const active = d?.deliveries.filter((x) => !['created', 'searching', 'unassigned'].includes(x.status)) ?? [];
  const pIcon = useMemo(() => pinIcon(PICKUP_COLOR), []);
  const dIcon = useMemo(() => pinIcon(DROPOFF_COLOR), []);
  const row = (x: LiveDelivery) => (
    <li key={x.id}>
      <button type="button" className={`ops-item ${selected === x.id ? 'ops-item--on' : ''}`} onClick={() => setSelected(x.id)} data-testid="ops-delivery">
        <div className="row between row-nowrap"><span className="strong ltr">#{x.orderNumber}</span><StatusBadge kind="delivery" status={x.status} /></div>
        <div className="text-sm truncate">{x.merchantName ?? t(`order.type.${x.orderType}`)} → {x.dropoff.address ?? '—'}</div>
        <div className="text-xs muted">{t(`order.type.${x.orderType}`)} · {relative(x.createdAt)}{x.captain ? ` · ${x.captain.firstName}` : ''}</div>
      </button>
    </li>
  );
  return (
    <div className="ops">
      <div className="ops__kpis" role="list" aria-label={t('ops.kpis')}>
        {d ? ([
          ['ops.kpi.active', num(d.kpis.activeDeliveries, 0)], ['ops.kpi.searching', num(d.kpis.searching, 0)], ['ops.kpi.unassigned', num(d.kpis.unassigned, 0)],
          ['ops.kpi.online', num(d.kpis.onlineCaptains, 0)], ['ops.kpi.busy', num(d.kpis.busyCaptains, 0)], ['ops.kpi.ordersToday', num(d.kpis.ordersToday, 0)],
          ['ops.kpi.gmvToday', money(d.kpis.gmvTodayBaisa)], ['ops.kpi.avgMinutes', d.kpis.avgDeliveryMinutesToday != null ? num(d.kpis.avgDeliveryMinutesToday, 1) : '—'],
        ] as const).map(([k, v]) => (
          <div key={k} className={`ops__kpi ${k === 'ops.kpi.unassigned' && d.kpis.unassigned ? 'ops__kpi--alert' : ''}`} role="listitem"><span className="kpi__label">{t(k)}</span><span className="ops__kpi-value">{v}</span></div>
        )) : null}
      </div>
      <div className="ops__body">
        <div className="ops__map">
          <MapView height="100%" zoom={11} ariaLabel={t('ops.map')}>
            {zones.data ? <ZoneLayer zones={zones.data.items} /> : null}
            {d?.deliveries.map((x) => (
              <span key={x.id}>
                {x.pickup.location && x.dropoff.location ? (
                  <Polyline positions={[[x.pickup.location.lat, x.pickup.location.lng], [x.dropoff.location.lat, x.dropoff.location.lng]]}
                    pathOptions={{ color: x.status === 'unassigned' ? '#C2410C' : selected === x.id ? '#F4A300' : '#0E7C66', weight: selected === x.id ? 4 : 2.5, dashArray: x.captain ? undefined : '6 6' }}
                    eventHandlers={{ click: () => setSelected(x.id) }} />
                ) : null}
                {x.pickup.location ? <Marker position={[x.pickup.location.lat, x.pickup.location.lng]} icon={pIcon} eventHandlers={{ click: () => setSelected(x.id) }}><Tooltip>#{x.orderNumber} · {t('ops.pickup')}</Tooltip></Marker> : null}
                {x.dropoff.location ? <Marker position={[x.dropoff.location.lat, x.dropoff.location.lng]} icon={dIcon} eventHandlers={{ click: () => setSelected(x.id) }}><Tooltip>#{x.orderNumber} · {t('ops.dropoff')}</Tooltip></Marker> : null}
              </span>
            ))}
            {d?.captains.map((c) => (
              <Marker key={c.id} position={[c.location.lat, c.location.lng]} icon={captainIcon(c.activeDeliveries > 0, c.fullName[0] ?? 'C')}>
                <Tooltip>{c.fullName} · {t(`vehicle.${c.vehicleType}`)} · {c.activeDeliveries ? t('ops.busyN', { n: c.activeDeliveries }) : t('ops.free')}</Tooltip>
              </Marker>
            ))}
            {d && zones.data ? <FitBounds points={zones.data.items.flatMap((z) => (z.boundary?.coordinates[0] ?? []).map(([lng, lat]) => ({ lat, lng })))} fitKey="zones" maxZoom={12} padding={10} /> : null}
          </MapView>
          <div className="ops__legend" aria-hidden="true">
            <span><i className="captain-marker captain-marker--free" style={{ width: 12, height: 12, borderWidth: 2, display: 'inline-block' }} /> {t('ops.free')}</span>
            <span><i className="captain-marker captain-marker--busy" style={{ width: 12, height: 12, borderWidth: 2, display: 'inline-block' }} /> {t('ops.busy')}</span>
            <span style={{ color: '#0E7C66' }}>━ {t('ops.legendRoute')}</span>
          </div>
        </div>
        <aside className="ops__side" aria-label={t('ops.queue')}>
          {live.isLoading ? <Loading /> : live.isError ? <ErrorState error={live.error} onRetry={() => live.refetch()} /> : (
            <>
              <section>
                <h2 className="ops__h">{t('ops.queue')} <Badge tone={queue.length ? 'accent' : 'neutral'}>{num(queue.length, 0)}</Badge></h2>
                {queue.length ? <ul className="ops__list">{queue.map(row)}</ul> : <EmptyState icon="check" title={t('ops.queueEmpty')} />}
              </section>
              <section>
                <h2 className="ops__h">{t('ops.active')} <Badge>{num(active.length, 0)}</Badge></h2>
                {active.length ? <ul className="ops__list">{active.map(row)}</ul> : <p className="text-sm muted pad">{t('ops.noActive')}</p>}
              </section>
              <section>
                <h2 className="ops__h">{t('ops.captainsOnline')} <Badge>{num(d?.captains.length ?? 0, 0)}</Badge></h2>
                <ul className="ops__list" data-testid="ops-captains">
                  {d?.captains.map((c) => (
                    <li key={c.id} className="ops-captain">
                      <span className={`captain-dot ${c.activeDeliveries ? 'captain-dot--busy' : ''}`} aria-hidden="true" />
                      <span className="grow truncate">{c.fullName}</span>
                      <span className="text-xs muted">{t(`vehicle.${c.vehicleType}`)} · {relative(c.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <p className="text-xs muted pad">{t('ops.etaNote')}</p>
            </>
          )}
        </aside>
      </div>
      <DeliveryPanel id={selected} captains={d?.captains ?? []} onClose={() => setSelected(null)} />
    </div>
  );
}
