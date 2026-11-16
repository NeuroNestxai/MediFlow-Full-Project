-- RBAC reference data (generated from docs/USER_ROLES_AND_PERMISSIONS.md matrix)
INSERT INTO permissions (key, description) VALUES
  ('merchants:read', 'View merchants and their documents'),
  ('merchants:review', 'Approve or reject merchant applications and documents'),
  ('merchants:manage', 'Suspend/reactivate merchants, change plan and commission'),
  ('captains:read', 'View captains, documents, locations'),
  ('captains:review', 'Approve or reject captain applications and documents'),
  ('captains:manage', 'Suspend/reactivate captains, edit captain profiles'),
  ('orders:read', 'View all orders'),
  ('orders:manage', 'Cancel or modify any order'),
  ('orders:refund', 'Issue refunds'),
  ('deliveries:read', 'View all deliveries and live operations map'),
  ('deliveries:dispatch', 'Assign, reassign and re-dispatch deliveries'),
  ('deliveries:cancel', 'Cancel deliveries'),
  ('zones:manage', 'Create and edit service zones'),
  ('pricing:manage', 'Edit delivery pricing rules'),
  ('dispatch_rules:manage', 'Edit dispatch rules'),
  ('settings:manage', 'Edit platform settings (VAT, service fee, COD limits)'),
  ('plans:manage', 'Manage subscription plans and merchant subscriptions'),
  ('support:read', 'View support tickets'),
  ('support:reply', 'Reply to and update support tickets'),
  ('support:assign', 'Assign tickets to agents'),
  ('analytics:read', 'View platform analytics'),
  ('finance:read', 'View ledgers, balances and settlements'),
  ('settlements:manage', 'Generate settlement batches and record payouts'),
  ('settlements:approve', 'Approve settlement batches (separate from preparation)'),
  ('users:read', 'View users'),
  ('users:manage', 'Suspend or reactivate users'),
  ('staff:manage', 'Create admin staff and assign platform roles'),
  ('audit:read', 'View the audit log'),
  ('merchant.store:read', 'View store profile and settings'),
  ('merchant.store:manage', 'Edit store profile, branding, banners, hours, WhatsApp settings'),
  ('merchant.catalog:write', 'Create and edit categories, products, variants and add-ons'),
  ('merchant.orders:read', 'View the store''s orders'),
  ('merchant.orders:process', 'Accept, reject, mark ready and cancel the store''s orders'),
  ('merchant.deliveries:create', 'Book merchant-initiated deliveries'),
  ('merchant.payment_links:manage', 'Create and cancel payment links'),
  ('merchant.finance:read', 'View store balance, ledger and settlements'),
  ('merchant.analytics:read', 'View store analytics'),
  ('merchant.staff:manage', 'Invite and remove store staff');
INSERT INTO roles (key, name, scope) VALUES ('super_admin', 'Super admin', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'super_admin' AND p.key IN ('merchants:read', 'merchants:review', 'merchants:manage', 'captains:read', 'captains:review', 'captains:manage', 'orders:read', 'orders:manage', 'orders:refund', 'deliveries:read', 'deliveries:dispatch', 'deliveries:cancel', 'zones:manage', 'pricing:manage', 'dispatch_rules:manage', 'settings:manage', 'plans:manage', 'support:read', 'support:reply', 'support:assign', 'analytics:read', 'finance:read', 'settlements:manage', 'settlements:approve', 'users:read', 'users:manage', 'staff:manage', 'audit:read');
INSERT INTO roles (key, name, scope) VALUES ('ops_manager', 'Operations manager', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'ops_manager' AND p.key IN ('merchants:read', 'captains:read', 'captains:manage', 'orders:read', 'orders:manage', 'deliveries:read', 'deliveries:dispatch', 'deliveries:cancel', 'zones:manage', 'dispatch_rules:manage', 'support:read', 'support:reply', 'support:assign', 'analytics:read', 'users:read', 'audit:read');
INSERT INTO roles (key, name, scope) VALUES ('dispatcher', 'Dispatcher', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'dispatcher' AND p.key IN ('merchants:read', 'captains:read', 'orders:read', 'deliveries:read', 'deliveries:dispatch');
INSERT INTO roles (key, name, scope) VALUES ('support_agent', 'Support agent', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'support_agent' AND p.key IN ('merchants:read', 'captains:read', 'orders:read', 'deliveries:read', 'support:read', 'support:reply', 'users:read');
INSERT INTO roles (key, name, scope) VALUES ('onboarding_reviewer', 'Onboarding reviewer', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'onboarding_reviewer' AND p.key IN ('merchants:read', 'merchants:review', 'captains:read', 'captains:review');
INSERT INTO roles (key, name, scope) VALUES ('finance', 'Finance officer', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'finance' AND p.key IN ('merchants:read', 'captains:read', 'orders:read', 'orders:refund', 'finance:read', 'settlements:manage', 'analytics:read', 'plans:manage');
INSERT INTO roles (key, name, scope) VALUES ('finance_manager', 'Finance manager', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'finance_manager' AND p.key IN ('merchants:read', 'captains:read', 'orders:read', 'finance:read', 'settlements:approve', 'analytics:read', 'pricing:manage', 'settings:manage');
INSERT INTO roles (key, name, scope) VALUES ('analyst', 'Analyst (read-only)', 'platform');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'analyst' AND p.key IN ('merchants:read', 'captains:read', 'orders:read', 'deliveries:read', 'analytics:read', 'finance:read');
INSERT INTO roles (key, name, scope) VALUES ('merchant_owner', 'Store owner', 'merchant');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'merchant_owner' AND p.key IN ('merchant.store:read', 'merchant.store:manage', 'merchant.catalog:write', 'merchant.orders:read', 'merchant.orders:process', 'merchant.deliveries:create', 'merchant.payment_links:manage', 'merchant.finance:read', 'merchant.analytics:read', 'merchant.staff:manage');
INSERT INTO roles (key, name, scope) VALUES ('merchant_manager', 'Store manager', 'merchant');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'merchant_manager' AND p.key IN ('merchant.store:read', 'merchant.store:manage', 'merchant.catalog:write', 'merchant.orders:read', 'merchant.orders:process', 'merchant.deliveries:create', 'merchant.payment_links:manage', 'merchant.finance:read', 'merchant.analytics:read');
INSERT INTO roles (key, name, scope) VALUES ('merchant_staff', 'Store staff', 'merchant');
INSERT INTO role_permissions (role_id, permission_key) SELECT r.id, p.key FROM roles r, permissions p WHERE r.key = 'merchant_staff' AND p.key IN ('merchant.store:read', 'merchant.orders:read', 'merchant.orders:process', 'merchant.deliveries:create');
INSERT INTO roles (key, name, scope) VALUES ('consumer', 'Consumer', 'self');
INSERT INTO roles (key, name, scope) VALUES ('captain', 'Captain', 'self');
