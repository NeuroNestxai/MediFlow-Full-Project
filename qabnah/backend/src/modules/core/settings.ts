import { q, type Queryable } from '../../db/pool.js';

export const DEFAULT_SETTINGS = {
  vatRateBps: 500,                 // 5% (RD 121/2020) — confirm treatment with tax advisor (DECISIONS D-020)
  serviceFeeBaisa: 100,            // marketplace orders only
  defaultCommissionBps: 1000,      // used when merchant has no plan/override
  codMaxBaisa: 50_000,             // max cash per order
  captainCashLimitBaisa: 100_000,  // captains holding more cash get no COD offers
  merchantAcceptTimeoutMinutes: 10,
  pendingPaymentTimeoutMinutes: 30,
  requireFleetForNonOmani: true,   // DECISIONS D-013
  requiredCaptainDocuments: ['national_id', 'driving_license', 'vehicle_registration', 'profile_photo'] as string[],
  supportPhone: '+96800000000',
};
export type Settings = typeof DEFAULT_SETTINGS;

export async function getSettings(db: Queryable): Promise<Settings> {
  const rows = await q<{ key: string; value: any }>(db, `SELECT key, value FROM platform_settings`);
  const s: any = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s;
}

export async function updateSettings(db: Queryable, patch: Partial<Settings>, userId: string | null) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    await q(db, `INSERT INTO platform_settings (key, value, updated_by) VALUES ($1,$2,$3)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [k, JSON.stringify(v), userId]);
  }
  return getSettings(db);
}
