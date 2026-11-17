import { useState, Fragment } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, CopyButton, EmptyState, ErrorState, Input, Loading, Modal, PageHeader, Pagination, Select, StatusBadge, Tabs,
  errorMessage, isApiError, useDebounced, useI18n, useToast, type AdminUser, type AuditLog, type Items, type PlatformStaff, type RolesResponse,
} from '@qabnah/shared';
import { api } from '../api';
import { useSession } from '../session';

const LIMIT = 25;

export function UsersPage() {
  const { t, dateTime, num } = useI18n();
  const { can, me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q, 350);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const r = useQuery({ queryKey: ['a', 'users', dq, offset], queryFn: () => api.get<{ items: AdminUser[]; total: number }>('/admin/users', { query: { q: dq || undefined, limit: LIMIT, offset } }), placeholderData: keepPreviousData });
  const setStatus = useMutation({
    mutationFn: (u: AdminUser) => api.post(`/admin/users/${u.id}/status`, { status: u.status === 'active' ? 'suspended' : 'active' }),
    onSuccess: () => { setTarget(null); void qc.invalidateQueries({ queryKey: ['a', 'users'] }); toast.push(t('common.saved')); },
  });
  return (
    <>
      <PageHeader title={t('nav.users')} description={t('users.hint')} />
      <Card flush title={<Input type="search" aria-label={t('common.search')} placeholder={t('users.search')} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} fieldClassName="grow" />}>
        {r.isLoading ? <Loading /> : r.isError ? <ErrorState error={r.error} onRetry={() => r.refetch()} /> : !r.data?.items.length ? <EmptyState icon="users" title={t('users.empty')} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('users.contact')}</th><th>{t('users.roles')}</th><th className="num">{t('users.orders')}</th><th>{t('common.status')}</th><th>{t('users.joined')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
              <tbody>{r.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="strong">{u.fullName || '—'}</td>
                  <td><div className="ltr">{u.phone ?? ''}</div><div className="ltr text-xs muted">{u.email ?? ''}</div></td>
                  <td>{u.roles.length ? u.roles.map((x) => <Badge key={x}>{t(`role.${x}`)}</Badge>) : <span className="muted text-sm">{t('users.consumer')}</span>}</td>
                  <td className="num">{num(u.orders, 0)}</td>
                  <td><StatusBadge kind="raw" status={u.status} /></td>
                  <td className="nowrap">{dateTime(u.createdAt)}</td>
                  <td>{can('users:manage') && u.id !== me.user.id ? <Button size="sm" variant={u.status === 'active' ? 'danger-outline' : 'primary'} onClick={() => { setStatus.reset(); setTarget(u); }}>{u.status === 'active' ? t('users.suspend') : t('users.reactivate')}</Button> : null}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pagination total={r.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      <ConfirmDialog open={!!target} tone={target?.status === 'active' ? 'danger' : 'primary'} title={target?.status === 'active' ? t('users.suspendTitle') : t('users.reactivateTitle')}
        message={target ? t(target.status === 'active' ? 'users.suspendBody' : 'users.reactivateBody', { name: target.fullName || target.phone || '' }) : ''}
        confirmLabel={target?.status === 'active' ? t('users.suspend') : t('users.reactivate')} loading={setStatus.isPending} error={setStatus.isError ? errorMessage(setStatus.error, t) : null}
        onClose={() => setTarget(null)} onConfirm={() => target && setStatus.mutate(target)} />
    </>
  );
}

function RoleMatrix({ data }: { data: RolesResponse }) {
  const { t } = useI18n();
  const [scope, setScope] = useState<'platform' | 'merchant'>('platform');
  const roles = data.roles.filter((r) => r.scope === scope);
  const perms = data.permissions.filter((p) => (scope === 'merchant' ? p.key.startsWith('merchant.') : !p.key.startsWith('merchant.')));
  return (
    <Card flush title={t('staff.matrix')} actions={<Tabs label={t('staff.scope')} value={scope} onChange={setScope} tabs={[{ value: 'platform', label: t('staff.platform') }, { value: 'merchant', label: t('staff.merchant') }]} />}>
      <div className="table-wrap"><table className="table matrix">
        <thead><tr><th>{t('staff.permission')}</th>{roles.map((r) => <th key={r.key} title={r.name}>{t(`role.${r.key}`)}</th>)}</tr></thead>
        <tbody>{perms.map((p) => (
          <tr key={p.key}><td><span className="mono text-sm">{p.key}</span><div className="text-xs muted">{p.description}</div></td>
            {roles.map((r) => <td key={r.key} className="matrix__cell">{r.permissions.includes(p.key) ? <span className="success-text" aria-label={t('common.yes')}>✔</span> : <span className="sr-only">{t('common.no')}</span>}</td>)}</tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

export function StaffPage() {
  const { t, dateTime } = useI18n();
  const { can, me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can('staff:manage');
  const staff = useQuery({ queryKey: ['a', 'staff'], queryFn: () => api.get<Items<PlatformStaff>>('/admin/staff'), enabled: manage });
  const roles = useQuery({ queryKey: ['a', 'roles'], queryFn: () => api.get<RolesResponse>('/admin/roles') });
  const platformRoles = roles.data?.roles.filter((r) => r.scope === 'platform') ?? [];
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState<{ email: string; fullName: string; roleKeys: string[] }>({ email: '', fullName: '', roleKeys: [] });
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [editing, setEditing] = useState<PlatformStaff | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [resetTarget, setResetTarget] = useState<PlatformStaff | null>(null);
  const resetMfa = useMutation({
    mutationFn: (s: PlatformStaff) => api.post(`/admin/users/${s.userId}/mfa-reset`),
    onSuccess: () => { setResetTarget(null); void qc.invalidateQueries({ queryKey: ['a', 'staff'] }); toast.push(t('staff.mfaResetDone')); },
  });
  const create = useMutation({
    mutationFn: () => api.post<{ userId: string; temporaryPassword: string }>('/admin/staff', { email: f.email.trim(), fullName: f.fullName.trim(), roleKeys: f.roleKeys }),
    onSuccess: (r) => { setCreating(false); setCreated({ email: f.email.trim(), temporaryPassword: r.temporaryPassword }); setF({ email: '', fullName: '', roleKeys: [] }); void qc.invalidateQueries({ queryKey: ['a', 'staff'] }); },
  });
  const saveRoles = useMutation({
    mutationFn: () => api.put(`/admin/staff/${editing!.userId}/roles`, { roleKeys: editRoles }),
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ['a', 'staff'] }); toast.push(t('common.saved')); },
  });
  const fe = isApiError(create.error) ? create.error.fieldErrors : {};
  const roleChecks = (sel: string[], set: (v: string[]) => void) => (
    <div className="stack stack-sm">{platformRoles.map((r) => <Checkbox key={r.key} checked={sel.includes(r.key)} onChange={(v) => set(v ? [...sel, r.key] : sel.filter((x) => x !== r.key))} label={<><strong>{t(`role.${r.key}`)}</strong> <span className="text-xs muted">{t(`roleHint.${r.key}`)}</span></>} />)}</div>
  );
  return (
    <>
      <PageHeader title={t('nav.staff')} description={t('staff.hint')} actions={manage ? <Button variant="primary" icon="plus" onClick={() => { create.reset(); setCreating(true); }}>{t('staff.new')}</Button> : null} />
      {created ? (
        <Alert tone="success" title={t('staff.createdTitle', { email: created.email })} action={<Button size="sm" variant="ghost" iconOnly icon="x" aria-label={t('common.close')} onClick={() => setCreated(null)} />}>
          <div className="stack stack-sm"><span>{t('staff.tempPassword')}</span><div className="row"><code className="mono temp-pass" data-testid="temp-password">{created.temporaryPassword}</code><CopyButton text={created.temporaryPassword} /></div><span className="text-sm">{t('staff.tempNote')}</span></div>
        </Alert>
      ) : null}
      {manage ? (
        <Card flush title={t('staff.list')}>
          {staff.isLoading ? <Loading /> : staff.isError ? <ErrorState error={staff.error} onRetry={() => staff.refetch()} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('users.roles')}</th><th>{t('staff.lastLogin')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
              <tbody>{staff.data?.items.map((s) => (
                <tr key={s.userId}>
                  <td className="strong">{s.fullName}{s.userId === me.user.id ? <> <Badge tone="primary">{t('staff.you')}</Badge></> : null}</td>
                  <td className="ltr">{s.email}</td>
                  <td>{s.roles.map((r) => <Badge key={r} tone={r === 'super_admin' ? 'accent' : 'neutral'}>{t(`role.${r}`)}</Badge>)}</td>
                  <td className="nowrap">{dateTime(s.lastLoginAt)}</td>
                  <td><div className="row row-nowrap">
                    <Button size="sm" onClick={() => { saveRoles.reset(); setEditRoles(s.roles); setEditing(s); }}>{t('staff.editRoles')}</Button>
                    {s.userId !== me.user.id ? <Button size="sm" variant="danger-outline" icon="key" onClick={() => { resetMfa.reset(); setResetTarget(s); }}>{t('staff.resetMfa')}</Button> : null}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      ) : <Alert tone="info">{t('staff.readOnly')}</Alert>}
      {roles.isLoading ? <Loading /> : roles.isError ? <ErrorState error={roles.error} onRetry={() => roles.refetch()} /> : roles.data ? <RoleMatrix data={roles.data} /> : null}
      <ConfirmDialog open={!!resetTarget} tone="danger" title={t('staff.resetMfaTitle')} message={resetTarget ? t('staff.resetMfaBody', { name: resetTarget.fullName }) : ''}
        confirmLabel={t('staff.resetMfa')} loading={resetMfa.isPending} error={resetMfa.isError ? errorMessage(resetMfa.error, t) : null}
        onClose={() => setResetTarget(null)} onConfirm={() => resetTarget && resetMfa.mutate(resetTarget)} />
      <Modal open={creating} onClose={() => setCreating(false)} title={t('staff.new')}
        footer={<><Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={create.isPending} disabled={!f.email || f.fullName.trim().length < 2 || !f.roleKeys.length} onClick={() => create.mutate()}>{t('common.create')}</Button></>}>
        <div className="stack">
          <Input label={t('common.name')} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={fe.fullName} />
          <Input label={t('common.email')} type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fe.email} />
          <div className="field"><span className="field__label">{t('users.roles')}</span>{roleChecks(f.roleKeys, (v) => setF({ ...f, roleKeys: v }))}</div>
          {create.isError ? <Alert tone="danger">{errorMessage(create.error, t)}</Alert> : null}
        </div>
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('staff.editRolesFor', { name: editing?.fullName ?? '' })}
        footer={<><Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={saveRoles.isPending} onClick={() => saveRoles.mutate()}>{t('common.save')}</Button></>}>
        <div className="stack">
          {roleChecks(editRoles, setEditRoles)}
          {!editRoles.length ? <Alert tone="warning">{t('staff.noRolesWarning')}</Alert> : null}
          {saveRoles.isError ? <Alert tone="danger">{errorMessage(saveRoles.error, t)}</Alert> : null}
        </div>
      </Modal>
    </>
  );
}

export function AuditPage() {
  const { t, dateTime } = useI18n();
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const did = useDebounced(entityId, 400);
  const q = useQuery({ queryKey: ['a', 'audit', entityType, did, offset], queryFn: () => api.get<Items<AuditLog>>('/admin/audit-logs', { query: { entityType: entityType || undefined, entityId: did || undefined, limit: LIMIT, offset } }), placeholderData: keepPreviousData });
  const items = q.data?.items ?? [];
  return (
    <>
      <PageHeader title={t('nav.audit')} description={t('audit.hint')} />
      <Card flush title={<div className="row grow">
        <Select aria-label={t('audit.entityType')} value={entityType} onChange={(e) => { setEntityType(e.target.value); setOffset(0); }} placeholder={t('audit.anyEntity')}
          options={['merchant', 'captain', 'order', 'delivery', 'settlement', 'user', 'zone', 'pricing_rule', 'dispatch_rule', 'plan', 'support_ticket', 'merchant_document', 'captain_document', 'platform_settings', 'fleet_partner'].map((x) => ({ value: x, label: x }))} />
        <Input aria-label={t('audit.entityId')} placeholder={t('audit.entityId')} dir="ltr" value={entityId} onChange={(e) => { setEntityId(e.target.value); setOffset(0); }} fieldClassName="grow" />
      </div>}>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !items.length ? <EmptyState icon="history" title={t('audit.empty')} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.date')}</th><th>{t('audit.actor')}</th><th>{t('audit.action')}</th><th>{t('audit.entity')}</th><th>IP</th><th><span className="sr-only">{t('common.details')}</span></th></tr></thead>
              <tbody>{items.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td className="nowrap">{dateTime(a.createdAt)}</td><td>{a.actor ?? t('audit.system')}</td><td className="mono text-sm">{a.action}</td>
                    <td className="text-sm">{a.entityType}<div className="mono text-xs muted">{a.entityId}</div></td><td className="mono text-xs">{a.ip}</td>
                    <td><Button size="sm" variant="ghost" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? t('audit.hide') : t('audit.show')}</Button></td>
                  </tr>
                  {open === a.id ? <tr><td colSpan={6}><pre className="mono text-xs ltr" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(a.data, null, 2)}</pre></td></tr> : null}
                </Fragment>
              ))}</tbody>
            </table></div>
            <div className="pagination">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>{t('common.previous')}</Button>
              <Button size="sm" disabled={items.length < LIMIT} onClick={() => setOffset(offset + LIMIT)}>{t('common.next')}</Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
