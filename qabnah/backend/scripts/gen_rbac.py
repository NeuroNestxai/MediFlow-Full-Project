perms = {
 # platform
 "merchants:read":"View merchants and their documents",
 "merchants:review":"Approve or reject merchant applications and documents",
 "merchants:manage":"Suspend/reactivate merchants, change plan and commission",
 "captains:read":"View captains, documents, locations",
 "captains:review":"Approve or reject captain applications and documents",
 "captains:manage":"Suspend/reactivate captains, edit captain profiles",
 "orders:read":"View all orders",
 "orders:manage":"Cancel or modify any order",
 "orders:refund":"Issue refunds",
 "deliveries:read":"View all deliveries and live operations map",
 "deliveries:dispatch":"Assign, reassign and re-dispatch deliveries",
 "deliveries:cancel":"Cancel deliveries",
 "zones:manage":"Create and edit service zones",
 "pricing:manage":"Edit delivery pricing rules",
 "dispatch_rules:manage":"Edit dispatch rules",
 "settings:manage":"Edit platform settings (VAT, service fee, COD limits)",
 "plans:manage":"Manage subscription plans and merchant subscriptions",
 "support:read":"View support tickets",
 "support:reply":"Reply to and update support tickets",
 "support:assign":"Assign tickets to agents",
 "analytics:read":"View platform analytics",
 "finance:read":"View ledgers, balances and settlements",
 "settlements:manage":"Generate settlement batches and record payouts",
 "settlements:approve":"Approve settlement batches (separate from preparation)",
 "users:read":"View users",
 "users:manage":"Suspend or reactivate users",
 "staff:manage":"Create admin staff and assign platform roles",
 "audit:read":"View the audit log",
 # merchant-scoped
 "merchant.store:read":"View store profile and settings",
 "merchant.store:manage":"Edit store profile, branding, banners, hours, WhatsApp settings",
 "merchant.catalog:write":"Create and edit categories, products, variants and add-ons",
 "merchant.orders:read":"View the store's orders",
 "merchant.orders:process":"Accept, reject, mark ready and cancel the store's orders",
 "merchant.deliveries:create":"Book merchant-initiated deliveries",
 "merchant.payment_links:manage":"Create and cancel payment links",
 "merchant.finance:read":"View store balance, ledger and settlements",
 "merchant.analytics:read":"View store analytics",
 "merchant.staff:manage":"Invite and remove store staff",
}
platform = [k for k in perms if not k.startswith("merchant.")]
merchant = [k for k in perms if k.startswith("merchant.")]
roles = {
 ("super_admin","Super admin","platform"): platform,
 ("ops_manager","Operations manager","platform"): ["merchants:read","captains:read","captains:manage","orders:read","orders:manage","deliveries:read","deliveries:dispatch","deliveries:cancel","zones:manage","dispatch_rules:manage","support:read","support:reply","support:assign","analytics:read","users:read","audit:read"],
 ("dispatcher","Dispatcher","platform"): ["merchants:read","captains:read","orders:read","deliveries:read","deliveries:dispatch"],
 ("support_agent","Support agent","platform"): ["merchants:read","captains:read","orders:read","deliveries:read","support:read","support:reply","users:read"],
 ("onboarding_reviewer","Onboarding reviewer","platform"): ["merchants:read","merchants:review","captains:read","captains:review"],
 ("finance","Finance officer","platform"): ["merchants:read","captains:read","orders:read","orders:refund","finance:read","settlements:manage","analytics:read","plans:manage"],
 ("finance_manager","Finance manager","platform"): ["merchants:read","captains:read","orders:read","finance:read","settlements:approve","analytics:read","pricing:manage","settings:manage"],
 ("analyst","Analyst (read-only)","platform"): ["merchants:read","captains:read","orders:read","deliveries:read","analytics:read","finance:read"],
 ("merchant_owner","Store owner","merchant"): merchant,
 ("merchant_manager","Store manager","merchant"): [k for k in merchant if k!="merchant.staff:manage"],
 ("merchant_staff","Store staff","merchant"): ["merchant.store:read","merchant.orders:read","merchant.orders:process","merchant.deliveries:create"],
 ("consumer","Consumer","self"): [],
 ("captain","Captain","self"): [],
}
q=lambda s: "'"+s.replace("'","''")+"'"
out=["-- RBAC reference data (generated from docs/USER_ROLES_AND_PERMISSIONS.md matrix)"]
out.append("INSERT INTO permissions (key, description) VALUES\n"+",\n".join(f"  ({q(k)}, {q(v)})" for k,v in perms.items())+";")
for (key,name,scope),ps in roles.items():
  out.append(f"INSERT INTO roles (key, name, scope) VALUES ({q(key)}, {q(name)}, {q(scope)});")
  if ps: out.append(f"INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = {q(key)} AND p.key IN ({', '.join(q(p) for p in ps)});")
open("migrations/002_rbac.sql","w").write("\n".join(out)+"\n")
# matrix markdown
cols=[r for r in roles if r[2]!='self']
md=["| Permission | Scope | "+" | ".join(r[0] for r in cols)+" |","|---|---|"+"---|"*len(cols)]
for k,v in perms.items():
  sc = "merchant" if k.startswith("merchant.") else "platform"
  md.append(f"| `{k}` | {sc} | "+" | ".join("✔" if k in roles[r] else "" for r in cols)+" |")
open("../docs/_permission_matrix.md","w").write("\n".join(md))
