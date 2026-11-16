import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Kpi, LinkButton, Loading, Modal, MoneyInput, PageHeader, Pagination, Segmented, Select,
  StatusBadge, Tabs, errorMessage, isApiError, useDebounced, useI18n, useToast,
  type AdminCaptainDetail, type AdminCaptainRow, type CaptainDocument, type FleetPartner, type Items, type Page,
} from '@qabnah/shared';
import { api } from '../api';
import { useSession } from '../session';

const LIMIT = 25;

export function CaptainsPage() {
  const { t, num, relative } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [online, setOnline] = useState<'' | 'true' | 'false'>('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q, 350);
  const r = useQuery({
    queryKey: ['a', 'captains', status, online, dq, offset],
    queryFn: () => api.get<Page<AdminCaptainRow>>('/admin/captains', { query: { status: status || undefined, online: online || undefined, q: dq || undefined, limit: LIMIT, offset } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title={t('nav.captains')} description={t('captains.hint')} />
      <Tabs label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setOffset(0); }}
        tabs={['', 'pending_review', 'pending_documents', 'active', 'suspended', 'rejected'].map((s) => ({ value: s, label: s ? t(`status.${s}`) : t('common.all') }))} />
      <Card flush title={<div className="row grow">
        <Input type="search" aria-label={t('common.search')} placeholder={t('captains.search')} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} fieldClassName="grow" />
        <Segmented label={t('captains.online')} value={online} onChange={(v) => { setOnline(v); setOffset(0); }} options={[{ value: '', label: t('common.all') }, { value: 'true', label: t('captains.onlineNow') }, { value: 'false', label: t('captains.offline') }]} />
      </div>}>
        {r.isLoading ? <Loading /> : r.isError ? <ErrorState error={r.error} onRetry={() => r.refetch()} /> : !r.data?.items.length ? <EmptyState icon="bike" title={t('captains.empty')} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('common.status')}</th><th>{t('captains.vehicle')}</th><th>{t('captains.model')}</th><th>{t('captains.online')}</th><th>{t('captains.rating')}</th><th>{t('captains.pendingDocs')}</th></tr></thead>
              <tbody>{r.data.items.map((c) => (
                <tr key={c.id} className="clickable" tabIndex={0} onClick={() => nav(`/captains/${c.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/captains/${c.id}`); }}>
                  <td><div className="strong">{c.fullName}</div><div className="text-xs muted ltr">{c.phone}</div></td>
                  <td><StatusBadge kind="raw" status={c.status} /></td>
                  <td>{t(`vehicle.${c.vehicleType}`)} <span className="text-xs muted ltr">{c.vehiclePlate}</span></td>
                  <td>{t(`captains.model.${c.employmentModel}`)}{c.fleetPartner ? <div className="text-xs muted">{c.fleetPartner}</div> : null}<div className="text-xs muted">{c.nationality}</div></td>
                  <td>{c.isOnline ? <Badge tone={c.activeDeliveries ? 'warning' : 'success'} dot>{c.activeDeliveries ? t('captains.busy') : t('captains.free')}</Badge> : <Badge>{t('captains.offline')}</Badge>}{c.locationAt ? <div className="text-xs muted">{relative(c.locationAt)}</div> : null}</td>
                  <td>{num(c.ratingAvg, 1)}</td>
                  <td>{c.pendingDocuments ? <Badge tone="warning">{num(c.pendingDocuments, 0)}</Badge> : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pagination total={r.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}

function DocTile({ d, canReview, onReview }: { d: CaptainDocument; canReview: boolean; onReview: (status: 'approved' | 'rejected') => void }) {
  const { t, date } = useI18n();
  const [isImage, setIsImage] = useState(true);
  return (
    <div className="doc-tile">
      <div className="doc-tile__preview">
        {isImage ? <img src={d.fileUrl} alt={t(`capDoc.${d.docType}`)} onError={() => setIsImage(false)} loading="lazy" /> : <a className="btn btn--sm" href={d.fileUrl} target="_blank" rel="noopener noreferrer">{t('captains.openFile')}</a>}
      </div>
      <div className="stack stack-sm" style={{ padding: 12 }}>
        <div className="row between"><strong>{t(`capDoc.${d.docType}`)}</strong><StatusBadge kind="raw" status={d.status} /></div>
        <span className="text-xs muted">{d.number ? <span className="ltr">{d.number}</span> : null}{d.expiresAt ? ` · ${t('captains.expires')} ${date(d.expiresAt)}` : ''}</span>
        {d.rejectionReason ? <span className="text-xs danger-text">{d.rejectionReason}</span> : null}
        <div className="row">
          <LinkButton size="sm" href={d.fileUrl} external icon="external">{t('common.open')}</LinkButton>
          {canReview ? <>
            <Button size="sm" variant="primary" disabled={d.status === 'approved'} onClick={() => onReview('approved')}>{t('captains.approveDoc')}</Button>
            <Button size="sm" variant="danger-outline" disabled={d.status === 'rejected'} onClick={() => onReview('rejected')}>{t('captains.rejectDoc')}</Button>
          </> : null}
        </div>
      </div>
    </div>
  );
}

type CapAction = 'approve' | 'reject' | 'suspend' | 'reactivate';
const CAP_ACTIONS: Record<string, CapAction[]> = { pending_review: ['approve', 'reject'], pending_documents: ['approve', 'reject'], rejected: ['approve'], active: ['suspend'], suspended: ['reactivate'] };

export function CaptainDetailPage() {
  const { id } = useParams();
  const { t, money, dateTime, num } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['a', 'captain', id], queryFn: () => api.get<AdminCaptainDetail>(`/admin/captains/${id}`) });
  const fleets = useQuery({ queryKey: ['a', 'fleets'], queryFn: () => api.get<Items<FleetPartner>>('/admin/fleet-partners') });
  const [approveOpen, setApproveOpen] = useState(false);
  const [model, setModel] = useState<'independent' | 'fleet'>('independent');
  const [fleetId, setFleetId] = useState('');
  const [action, setAction] = useState<CapAction | null>(null);
  const [docReject, setDocReject] = useState<string | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [cash, setCash] = useState<number | null>(null);
  const [cashNote, setCashNote] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['a', 'captain', id] }); void qc.invalidateQueries({ queryKey: ['a', 'captains'] }); };
  const act = useMutation({
    mutationFn: ({ a, body }: { a: CapAction; body: Record<string, unknown> }) => api.post(`/admin/captains/${id}/${a}`, body),
    onSuccess: (_, v) => { setAction(null); setApproveOpen(false); refresh(); toast.push(t(`captains.done.${v.a}`)); },
  });
  const review = useMutation({
    mutationFn: ({ docId, status, reason }: { docId: string; status: 'approved' | 'rejected'; reason?: string }) => api.post(`/admin/captain-documents/${docId}/review`, { status, ...(reason ? { reason } : {}) }),
    onSuccess: () => { setDocReject(null); refresh(); },
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  const remit = useMutation({
    mutationFn: () => api.post<{ balanceBaisa: number }>(`/admin/captains/${id}/cod-remittance`, { amountBaisa: cash, ...(cashNote.trim() ? { note: cashNote.trim() } : {}) }),
    onSuccess: (r) => { setCashOpen(false); refresh(); toast.push(t('captains.remitted', { balance: money(r.balanceBaisa) })); },
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const allowed = (CAP_ACTIONS[c.status] ?? []).filter((a) => can((a === 'approve' || a === 'reject') ? 'captains:review' : 'captains:manage'));
  const approveError = act.isError && isApiError(act.error) ? act.error : null;
  return (
    <>
      <PageHeader title={c.fullName} description={<span className="ltr">{c.phone}</span>}
        actions={<>
          <Link className="btn btn--ghost" to="/captains">{t('common.back')}</Link>
          {can('settlements:manage') ? <Button onClick={() => { remit.reset(); setCash(null); setCashNote(''); setCashOpen(true); }}>{t('captains.recordCash')}</Button> : null}
          {allowed.map((a) => <Button key={a} variant={a === 'approve' || a === 'reactivate' ? 'primary' : 'danger-outline'} onClick={() => {
            act.reset();
            if (a === 'approve') { setModel(c.employmentModel); setFleetId(c.fleetPartner?.id ?? ''); setApproveOpen(true); } else setAction(a);
          }}>{t(`captains.action.${a}`)}</Button>)}
        </>} />
      <div className="row"><StatusBadge kind="raw" status={c.status} />{c.isOnline ? <Badge tone="success" dot>{t('captains.onlineNow')}</Badge> : <Badge>{t('captains.offline')}</Badge>}<Badge>{t(`captains.model.${c.employmentModel}`)}{c.fleetPartner ? ` · ${c.fleetPartner.name}` : ''}</Badge></div>
      {c.rejectionReason ? <Alert tone="warning">{t('common.reason')}: {c.rejectionReason}</Alert> : null}
      {c.missingDocuments.length ? <Alert tone="warning" title={t('captains.missingDocs')}>{c.missingDocuments.map((d) => t(`capDoc.${d}`)).join(', ')}</Alert> : null}
      <div className="grid grid-4">
        <Kpi label={t('captains.delivered')} value={num(c.stats.delivered, 0)} hint={t('captains.failedN', { n: num(c.stats.failed, 0) })} />
        <Kpi label={t('captains.rating')} value={`${num(c.ratingAvg, 1)} ★`} hint={num(c.ratingCount, 0)} />
        <Kpi label={t('captains.acceptance')} value={`${num(c.acceptanceRate * 100, 0)}%`} />
        <Kpi label={t('captains.cashHeld')} value={money(c.stats.cashHeldBaisa)} tone={c.stats.cashHeldBaisa > 0 ? 'danger' : undefined} hint={t('captains.cashHeldHint')} />
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title={t('captains.profile')}>
          <dl className="dl">
            <dt>{t('captains.vehicle')}</dt><dd>{t(`vehicle.${c.vehicleType}`)} · {[c.vehicleMake, c.vehicleModel, c.vehicleColor].filter(Boolean).join(' ')} <span className="ltr">{c.vehiclePlate}</span></dd>
            <dt>{t('captains.nationality')}</dt><dd>{c.nationality ?? '—'}</dd>
            <dt>{t('captains.nationalId')}</dt><dd className="ltr">{c.nationalIdNumber ?? '—'}</dd>
            <dt>{t('captains.dob')}</dt><dd>{c.dateOfBirth ?? '—'}</dd>
            <dt>{t('captains.bank')}</dt><dd>{c.bankName ?? '—'} <span className="ltr mono">{c.iban}</span></dd>
            <dt>{t('captains.maxConcurrent')}</dt><dd>{num(c.maxConcurrent, 0)}</dd>
            <dt>{t('captains.availability')}</dt><dd>{c.availability.length ? c.availability.map((a) => `${t(`weekday.${a.weekday}`)} ${a.start}–${a.end}`).join(', ') : t('captains.anytime')}</dd>
          </dl>
        </Card>
        <Card title={t('captains.recent')}>
          {!c.recentDeliveries.length ? <p className="muted">—</p> : <ul className="item-list">{c.recentDeliveries.map((d) => <li key={d.id}><div className="row between"><span className="ltr">#{d.orderNumber}</span><StatusBadge kind="delivery" status={d.status} /></div><span className="text-xs muted">{dateTime(d.updatedAt)}</span></li>)}</ul>}
        </Card>
      </div>
      <Card title={t('captains.documents')}>
        {!c.documents.length ? <EmptyState icon="file" title={t('captains.noDocuments')} /> : (
          <div className="doc-grid">{c.documents.map((d) => <DocTile key={d.id} d={d} canReview={can('captains:review')} onReview={(s) => (s === 'approved' ? review.mutate({ docId: d.id, status: s }) : setDocReject(d.id))} />)}</div>
        )}
        <p className="text-xs muted" style={{ marginBlockStart: 10 }}>{t('captains.requiredDocs')}: {c.requiredDocuments.map((d) => t(`capDoc.${d}`)).join(', ')}</p>
      </Card>

      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} title={t('captains.approveTitle', { name: c.fullName })}
        footer={<><Button onClick={() => setApproveOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={act.isPending} disabled={model === 'fleet' && !fleetId}
          onClick={() => act.mutate({ a: 'approve', body: { employmentModel: model, ...(model === 'fleet' && fleetId ? { fleetPartnerId: fleetId } : {}) } })}>{t('captains.action.approve')}</Button></>}>
        <div className="stack">
          <div className="field"><span className="field__label">{t('captains.model')}</span>
            <Segmented label={t('captains.model')} value={model} onChange={setModel} options={[{ value: 'independent', label: t('captains.model.independent') }, { value: 'fleet', label: t('captains.model.fleet') }]} /></div>
          {model === 'fleet' ? <Select label={t('captains.fleetPartner')} value={fleetId} onChange={(e) => setFleetId(e.target.value)} placeholder="—" options={(fleets.data?.items ?? []).map((f) => ({ value: f.id, label: f.name }))} error={!fleetId ? t('captains.fleetRequiredHint') : null} /> : null}
          <p className="text-sm muted">{t('captains.approveHint')}</p>
          {approveError ? (
            <Alert tone="danger" title={approveError.code === 'fleet_required' ? t('captains.err.fleet_required') : approveError.code === 'documents_incomplete' ? t('captains.err.documents_incomplete') : t('common.error')}>{approveError.message}</Alert>
          ) : null}
        </div>
      </Modal>
      <ConfirmDialog open={!!action} tone={action === 'reactivate' ? 'primary' : 'danger'} title={action ? t(`captains.action.${action}`) : ''} reasonLabel={action === 'reject' || action === 'suspend' ? t('common.reason') : undefined}
        reasonRequired={action === 'reject' || action === 'suspend'} confirmLabel={action ? t(`captains.action.${action}`) : ''} loading={act.isPending} error={act.isError ? errorMessage(act.error, t) : null}
        onClose={() => setAction(null)} onConfirm={(reason) => action && act.mutate({ a: action, body: reason ? { reason } : {} })} />
      <ConfirmDialog open={!!docReject} tone="danger" title={t('captains.rejectDoc')} reasonLabel={t('common.reason')} reasonRequired confirmLabel={t('captains.rejectDoc')} loading={review.isPending}
        onClose={() => setDocReject(null)} onConfirm={(reason) => docReject && review.mutate({ docId: docReject, status: 'rejected', reason })} />
      <Modal open={cashOpen} onClose={() => setCashOpen(false)} title={t('captains.recordCash')}
        footer={<><Button onClick={() => setCashOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={remit.isPending} disabled={!cash || cash <= 0} onClick={() => remit.mutate()}>{t('captains.recordCash')}</Button></>}>
        <div className="stack">
          <p className="text-sm muted">{t('captains.cashHint', { held: money(c.stats.cashHeldBaisa) })}</p>
          <MoneyInput label={t('common.amount')} valueBaisa={cash} onChangeBaisa={setCash} />
          <Input label={t('common.notes')} value={cashNote} onChange={(e) => setCashNote(e.target.value)} optional />
          {remit.isError ? <Alert tone="danger">{errorMessage(remit.error, t)}</Alert> : null}
        </div>
      </Modal>
    </>
  );
}

export function FleetPartnersPage() {
  const { t, num, date } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['a', 'fleets'], queryFn: () => api.get<Items<FleetPartner>>('/admin/fleet-partners') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', crNumber: '', licenceNumber: '', licenceExpiresAt: '', contactName: '', contactPhone: '', contactEmail: '' });
  const create = useMutation({
    mutationFn: () => api.post('/admin/fleet-partners', Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))),
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['a', 'fleets'] }); toast.push(t('fleet.created')); },
  });
  const fe = isApiError(create.error) ? create.error.fieldErrors : {};
  const submit = (e: FormEvent) => { e.preventDefault(); if (f.name.trim().length >= 2) create.mutate(); };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <PageHeader title={t('nav.fleet')} description={t('fleet.hint')} actions={can('captains:manage') ? <Button variant="primary" icon="plus" onClick={() => { create.reset(); setOpen(true); }}>{t('fleet.new')}</Button> : null} />
      <Card flush>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="truck" title={t('fleet.empty')} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('fleet.cr')}</th><th>{t('fleet.licence')}</th><th>{t('fleet.contact')}</th><th>{t('common.status')}</th><th className="num">{t('nav.captains')}</th></tr></thead>
            <tbody>{q.data.items.map((p) => (
              <tr key={p.id}><td className="strong">{p.name}</td><td className="ltr">{p.crNumber ?? '—'}</td><td><span className="ltr">{p.licenceNumber ?? '—'}</span>{p.licenceExpiresAt ? <div className="text-xs muted">{date(p.licenceExpiresAt)}</div> : null}</td>
                <td>{p.contactName ?? '—'} <span className="text-xs muted ltr">{p.contactPhone}</span></td><td><StatusBadge kind="raw" status={p.status} /></td><td className="num">{num(p.captains, 0)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title={t('fleet.new')} footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit" form="fleet-form" variant="primary" loading={create.isPending}>{t('common.create')}</Button></>}>
        <form id="fleet-form" className="form-grid" onSubmit={submit} noValidate>
          <Input label={t('common.name')} value={f.name} onChange={set('name')} error={fe.name} required fieldClassName="span-all" />
          <Input label={t('fleet.cr')} dir="ltr" value={f.crNumber} onChange={set('crNumber')} optional />
          <Input label={t('fleet.licence')} dir="ltr" value={f.licenceNumber} onChange={set('licenceNumber')} optional />
          <Input label={t('fleet.licenceExpires')} type="date" value={f.licenceExpiresAt} onChange={set('licenceExpiresAt')} optional />
          <Input label={t('fleet.contactName')} value={f.contactName} onChange={set('contactName')} optional />
          <Input label={t('common.phone')} type="tel" dir="ltr" value={f.contactPhone} onChange={set('contactPhone')} optional />
          <Input label={t('common.email')} type="email" dir="ltr" value={f.contactEmail} onChange={set('contactEmail')} error={fe.contactEmail} optional />
          {create.isError ? <div className="span-all"><Alert tone="danger">{errorMessage(create.error, t)}</Alert></div> : null}
        </form>
      </Modal>
    </>
  );
}
