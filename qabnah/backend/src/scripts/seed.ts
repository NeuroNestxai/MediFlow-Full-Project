/**
 * Development / demo seed for the Muscat pilot. Wipes all business data (keeps RBAC reference data) and
 * recreates a reproducible dataset. All people, phones and e-mails are FAKE (+968 9000xxxx, @qabnah.test).
 * Zone polygons are rough boxes around approximate district centres — ops must redraw them before use.
 *
 *   npm run seed            (refuses to run when NODE_ENV=production)
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { migrate } from '../db/migrate.js';
import { pool, one, q, tx } from '../db/pool.js';
import { storage } from '../integrations/storage.js';
import { sha256 } from '../lib/crypto.js';
import { completeDelivery, captainAction, recordLocation } from '../modules/deliveries/service.js';
import { manualAssign } from '../modules/dispatch/service.js';
import { createMarketplaceOrder, createMerchantDelivery, createShipment, merchantOrderAction, cancelOrder } from '../modules/orders/service.js';

export const DEV_PASSWORD = 'Qabnah-Dev-2026!';

// Approximate district centres (research doc §6) — NOT surveyed boundaries.
export const ZONES = [
  { code: 'MCT-KHOUD', en: 'Al Khoud', ar: 'الخوض', lat: 23.595, lng: 58.150 },
  { code: 'MCT-SEEB', en: 'Seeb', ar: 'السيب', lat: 23.670, lng: 58.190 },
  { code: 'MCT-MAWALEH', en: 'Al Mawaleh', ar: 'الموالح', lat: 23.580, lng: 58.240 },
  { code: 'MCT-HAIL', en: 'Al Hail & Airport', ar: 'الحيل والمطار', lat: 23.600, lng: 58.305 },
  { code: 'MCT-GHUBRAH', en: 'Al Ghubrah', ar: 'الغبرة', lat: 23.598, lng: 58.370 },
  { code: 'MCT-MSQ', en: 'Madinat Sultan Qaboos', ar: 'مدينة السلطان قابوس', lat: 23.610, lng: 58.410 },
  { code: 'MCT-BAWSHAR', en: 'Bawshar', ar: 'بوشر', lat: 23.560, lng: 58.400 },
  { code: 'MCT-KHUWAIR', en: 'Al Khuwair', ar: 'الخوير', lat: 23.592, lng: 58.440 },
  { code: 'MCT-QURUM', en: 'Qurum', ar: 'القرم', lat: 23.610, lng: 58.485 },
  { code: 'MCT-RUWI', en: 'Ruwi & Muttrah', ar: 'روي ومطرح', lat: 23.600, lng: 58.550 },
  { code: 'MCT-AMERAT', en: 'Al Amerat', ar: 'العامرات', lat: 23.525, lng: 58.495 },
];

const box = (lat: number, lng: number, dLat = 0.03, dLng = 0.035) => ({
  type: 'Polygon',
  coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]],
});

// 1x1 PNG used as placeholder document scans (real uploads go through POST /v1/files).
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2b1f1c90000000049454e44ae426082', 'hex');

async function placeholderFile(ownerId: string, purpose: string) {
  const id = crypto.randomUUID();
  const key = `${purpose}/seed/${id}.png`;
  await storage.put(key, PNG);
  await q(pool, `INSERT INTO files (id, owner_user_id, purpose, visibility, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'private',$4,'image/png',$5,$6)`, [id, ownerId, purpose, key, PNG.length, sha256(PNG)]);
  return id;
}

async function user(fields: { phone?: string; email?: string; name: string; password?: boolean; locale?: string }) {
  const hash = fields.password ? await bcrypt.hash(DEV_PASSWORD, 10) : null;
  return one(pool, `INSERT INTO users (phone, email, full_name, password_hash, locale) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [fields.phone ?? null, fields.email ?? null, fields.name, hash, fields.locale ?? 'ar']);
}
const grant = (userId: string, role: string, merchantId: string | null = null) =>
  q(pool, `INSERT INTO user_roles (user_id, role_id, merchant_id) SELECT $1, id, $2 FROM roles WHERE key = $3`, [userId, merchantId, role]);

type Opt = [string, string, number];
const variant = (en: string, ar: string, options: Opt[]) => ({ kind: 'variant', en, ar, min: 1, max: 1, options });
const addon = (en: string, ar: string, max: number, options: Opt[]) => ({ kind: 'addon', en, ar, min: 0, max, options });

const MERCHANTS = [
  {
    slug: 'saffron-grill', en: 'Saffron Grill', ar: 'مشويات الزعفران', category: 'restaurant', zone: 'MCT-KHUWAIR', lat: 23.5885, lng: 58.4362, brand: '#B45309', accent: '#FDE68A',
    tagEn: 'Charcoal grills & shawarma since this morning', tagAr: 'مشويات على الفحم وشاورما طازجة', prep: 20, owner: 'owner@saffron-grill.qabnah.test', plan: 'starter',
    hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, open: '11:00', close: '01:00' })),
    banners: [['Family feast — serves 4', 'وليمة العائلة لأربعة أشخاص']],
    cats: [
      ['Shawarma', 'شاورما', [
        ['Chicken Shawarma', 'شاورما دجاج', 900, [variant('Size', 'الحجم', [['Regular', 'عادي', 0], ['Large', 'كبير', 400]]), addon('Extras', 'إضافات', 3, [['Cheese', 'جبن', 200], ['Extra garlic', 'ثوم إضافي', 100], ['Fries inside', 'بطاطس بالداخل', 150]])]],
        ['Beef Shawarma', 'شاورما لحم', 1100, [variant('Size', 'الحجم', [['Regular', 'عادي', 0], ['Large', 'كبير', 400]])]],
      ]],
      ['Grills', 'مشويات', [
        ['Mixed Grill Platter', 'طبق مشويات مشكلة', 4500, [variant('Bread', 'الخبز', [['Arabic bread', 'خبز عربي', 0], ['Rice instead', 'أرز بدلاً من الخبز', 300]])]],
        ['Shish Tawook', 'شيش طاووق', 2800, []],
      ]],
      ['Drinks', 'مشروبات', [['Laban', 'لبن', 300, []], ['Fresh Lemon Mint', 'ليمون بالنعناع', 800, []]]],
    ],
  },
  {
    slug: 'qahwa-house', en: 'Qahwa House', ar: 'بيت القهوة', category: 'cafe', zone: 'MCT-QURUM', lat: 23.6125, lng: 58.4815, brand: '#4B2E2A', accent: '#F4A300',
    tagEn: 'Omani qahwa, karak and dates', tagAr: 'قهوة عمانية وكرك وتمور', prep: 10, owner: 'owner@qahwa-house.qabnah.test', plan: 'growth',
    hours: [], banners: [['Karak Friday', 'كرك الجمعة']],
    cats: [
      ['Hot drinks', 'مشروبات ساخنة', [
        ['Karak Tea', 'شاي كرك', 300, [variant('Size', 'الحجم', [['Small', 'صغير', 0], ['Large', 'كبير', 200]]), variant('Sugar', 'السكر', [['Regular', 'عادي', 0], ['Less sugar', 'سكر خفيف', 0], ['No sugar', 'بدون سكر', 0]])]],
        ['Omani Qahwa Dallah', 'دلة قهوة عمانية', 2500, [addon('With', 'مع', 2, [['Khalas dates (250g)', 'تمر خلاص ٢٥٠غ', 1200], ['Halwa', 'حلوى عمانية', 1500]])]],
      ]],
      ['Sweets', 'حلويات', [['Luqaimat', 'لقيمات', 1200, []], ['Date Cake', 'كيك التمر', 1500, []]]],
    ],
  },
  {
    slug: 'nakheel-market', en: 'Nakheel Fresh Market', ar: 'سوق النخيل الطازج', category: 'grocery', zone: 'MCT-SEEB', lat: 23.6702, lng: 58.1885, brand: '#15803D', accent: '#FACC15',
    tagEn: 'Groceries delivered across Seeb', tagAr: 'مقاضي البيت إلى باب بيتك', prep: 25, owner: 'owner@nakheel-market.qabnah.test', plan: 'starter',
    hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, open: '07:00', close: '23:59' })), banners: [['Fresh produce every morning', 'خضار وفواكه طازجة كل صباح']],
    cats: [
      ['Fruit & veg', 'خضار وفواكه', [['Omani Bananas (1kg)', 'موز عماني ١ كغ', 650, [], 40], ['Tomatoes (1kg)', 'طماطم ١ كغ', 450, [], 60]]],
      ['Pantry', 'مواد غذائية', [['Basmati Rice (5kg)', 'أرز بسمتي ٥ كغ', 3900, [], 25], ['Fresh Milk (2L)', 'حليب طازج ٢ لتر', 1100, [], 30]]],
    ],
  },
  {
    slug: 'ward-flowers', en: 'Ward Flowers', ar: 'ورد', category: 'flowers', zone: 'MCT-MSQ', lat: 23.6085, lng: 58.4105, brand: '#BE185D', accent: '#FBCFE8',
    tagEn: 'Bouquets for every occasion', tagAr: 'باقات لكل مناسبة', prep: 30, owner: 'owner@ward-flowers.qabnah.test', plan: 'growth',
    hours: [], banners: [['Same-day bouquets', 'باقات في نفس اليوم']],
    cats: [
      ['Bouquets', 'باقات', [
        ['Red Roses Bouquet', 'باقة ورد أحمر', 12000, [variant('Stems', 'عدد الورود', [['12 roses', '١٢ وردة', 0], ['24 roses', '٢٤ وردة', 9000]]), addon('Add', 'إضافة', 2, [['Greeting card', 'بطاقة إهداء', 500], ['Chocolate box', 'علبة شوكولاتة', 4000]])]],
        ['Seasonal Mix', 'تشكيلة الموسم', 8500, []],
      ]],
    ],
  },
];

/** Sample photos served by the merchant web app (apps/merchant/public/sample). Illustrative, AI-generated — see its README. */
const PRODUCT_IMAGES: Record<string, string> = {
  'Chicken Shawarma': 'shawarma', 'Beef Shawarma': 'beef-shawarma', 'Mixed Grill Platter': 'grill', 'Shish Tawook': 'tawook', Laban: 'laban',
  'Fresh Lemon Mint': 'lemon-mint', 'Karak Tea': 'karak', 'Omani Qahwa Dallah': 'qahwa', Luqaimat: 'luqaimat', 'Date Cake': 'date-cake',
  'Omani Bananas (1kg)': 'bananas', 'Tomatoes (1kg)': 'tomatoes', 'Basmati Rice (5kg)': 'rice', 'Fresh Milk (2L)': 'milk',
  'Red Roses Bouquet': 'roses', 'Seasonal Mix': 'seasonal-bouquet',
};
/** Menu-style descriptions for the sample catalogue: [English, Arabic]. */
const PRODUCT_DESCRIPTIONS: Record<string, [string, string]> = {
  'Chicken Shawarma': ['Marinated chicken, garlic sauce and pickles in fresh saj bread.', 'دجاج متبّل مع ثومية ومخلل في خبز صاج طازج.'],
  'Beef Shawarma': ['Slow-roasted beef with tahini, onion and parsley.', 'لحم مشوي على مهل مع طحينة وبصل وبقدونس.'],
  'Mixed Grill Platter': ['Kebab, shish tawook and lamb chops with grilled vegetables and bread.', 'كباب وشيش طاووق وريش غنم مع خضار مشوية وخبز.'],
  'Shish Tawook': ['Charcoal-grilled chicken skewers with garlic sauce.', 'أسياخ دجاج مشوية على الفحم مع ثومية.'],
  Laban: ['Chilled salted yoghurt drink.', 'لبن مملّح بارد.'],
  'Fresh Lemon Mint': ['Fresh lemon juice blended with mint and ice.', 'عصير ليمون طازج مع النعناع والثلج.'],
  'Karak Tea': ['Strong black tea simmered with milk and cardamom.', 'شاي أسود مغلي مع الحليب والهيل.'],
  'Omani Qahwa Dallah': ['A dallah of Omani coffee with cardamom, served with dates.', 'دلة قهوة عُمانية بالهيل تُقدَّم مع التمر.'],
  Luqaimat: ['Crisp golden dumplings drizzled with date syrup.', 'لقيمات ذهبية مقرمشة مع دبس التمر.'],
  'Date Cake': ['Soft date cake with a caramel glaze.', 'كعكة تمر طرية بصوص الكراميل.'],
  'Omani Bananas (1kg)': ['Fresh Omani bananas, one kilogram.', 'موز عُماني طازج، كيلوغرام واحد.'],
  'Tomatoes (1kg)': ['Fresh red tomatoes, one kilogram.', 'طماطم حمراء طازجة، كيلوغرام واحد.'],
  'Basmati Rice (5kg)': ['Long-grain basmati rice, 5 kg bag.', 'أرز بسمتي طويل الحبة، كيس ٥ كجم.'],
  'Fresh Milk (2L)': ['Full-fat fresh milk, 2 litre bottle.', 'حليب طازج كامل الدسم، عبوة ٢ لتر.'],
  'Red Roses Bouquet': ['Hand-tied red roses wrapped in kraft paper.', 'ورود حمراء منسّقة يدوياً ومغلّفة بورق كرافت.'],
  'Seasonal Mix': ['A mixed bouquet of the season’s flowers.', 'باقة منوّعة من زهور الموسم.'],
};
const COVER_IMAGES: Record<string, string> = { 'saffron-grill': 'grill', 'qahwa-house': 'qahwa', 'nakheel-market': 'groceries', 'ward-flowers': 'roses' };
const sampleUrl = (name: string) => `${config.MERCHANT_WEB_URL}/sample/${name}.jpg`;

const CAPTAINS = [
  { phone: '+96890001001', name: 'Salim Al Harthy', vehicle: 'car', plate: '12345 A', nat: 'Omani', model: 'independent', zones: ['MCT-KHUWAIR', 'MCT-MSQ', 'MCT-QURUM', 'MCT-GHUBRAH'], lat: 23.590, lng: 58.430 },
  { phone: '+96890001002', name: 'Ahmed Al Balushi', vehicle: 'car', plate: '23456 B', nat: 'Omani', model: 'independent', zones: ['MCT-QURUM', 'MCT-RUWI', 'MCT-KHUWAIR'], lat: 23.612, lng: 58.478 },
  { phone: '+96890001003', name: 'Rashid Al Shukaili', vehicle: 'car', plate: '34567 D', nat: 'Omani', model: 'independent', zones: ['MCT-SEEB', 'MCT-KHOUD', 'MCT-MAWALEH'], lat: 23.668, lng: 58.195 },
  { phone: '+96890001004', name: 'Imran Khan', vehicle: 'bike', plate: '45678 H', nat: 'Pakistani', model: 'fleet', zones: ['MCT-KHUWAIR', 'MCT-GHUBRAH', 'MCT-MSQ', 'MCT-BAWSHAR'], lat: 23.594, lng: 58.442 },
  { phone: '+96890001005', name: 'Faisal Al Riyami', vehicle: 'van', plate: '56789 R', nat: 'Omani', model: 'independent', zones: ['MCT-MAWALEH', 'MCT-HAIL', 'MCT-SEEB'], lat: 23.585, lng: 58.245 },
  { phone: '+96890001006', name: 'Nasser Al Kindi', vehicle: 'car', plate: '67890 K', nat: 'Omani', model: 'independent', zones: ['MCT-AMERAT', 'MCT-RUWI', 'MCT-QURUM'], lat: 23.530, lng: 58.490 },
];

export async function wipe() {
  const tables = await q(pool, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('schema_migrations','roles','permissions','role_permissions','spatial_ref_sys')`);
  await q(pool, `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await q(pool, `ALTER SEQUENCE order_number_seq RESTART WITH 100001`);
  await q(pool, `ALTER SEQUENCE ticket_number_seq RESTART WITH 5001`);
}

export async function seedReference() {
  for (const z of ZONES)
    await q(pool, `INSERT INTO zones (code, name_en, name_ar, boundary) VALUES ($1,$2,$3, ST_GeomFromGeoJSON($4)::geography)`, [z.code, z.en, z.ar, JSON.stringify(box(z.lat, z.lng))]);
  await q(pool, `INSERT INTO subscription_plans (code, name_en, name_ar, monthly_fee_baisa, commission_bps, features) VALUES
    ('starter','Starter','الأساسية',0,1500,'{"storefront":true,"paymentLinks":true,"whatsapp":false}'),
    ('growth','Growth','النمو',15000,900,'{"storefront":true,"paymentLinks":true,"whatsapp":true,"analytics":true}')`);
  // Delivery pricing (illustrative pilot values in baisa — business must confirm).
  await q(pool, `INSERT INTO pricing_rules (name, delivery_type, vehicle_type, base_fee_baisa, per_km_baisa, included_km, min_fee_baisa, max_fee_baisa, max_distance_km, captain_share_bps, priority) VALUES
    ('Marketplace default', 'marketplace', NULL, 700, 100, 3, 700, 3000, 25, 8000, 0),
    ('Merchant delivery default', 'merchant_delivery', NULL, 1000, 120, 3, 1000, 4000, 40, 8000, 0),
    ('C2C default', 'c2c', NULL, 1200, 150, 2, 1200, 5000, 40, 8000, 0),
    ('C2C car/van', 'c2c', 'car', 1800, 180, 2, 1800, 7000, 60, 8000, 0),
    ('C2C van', 'c2c', 'van', 3500, 250, 2, 3500, 12000, 60, 8000, 0),
    ('Fallback', NULL, NULL, 1000, 150, 3, 1000, 5000, 40, 8000, -10)`);
  await q(pool, `INSERT INTO dispatch_rules (zone_id) VALUES (NULL)`);
  await q(pool, `INSERT INTO platform_settings (key, value) VALUES ('supportPhone', '"+96824000000"')`);
}

async function seedPeople() {
  const staff: [string, string, string][] = [
    ['admin@qabnah.test', 'Platform Admin', 'super_admin'], ['ops@qabnah.test', 'Ops Manager', 'ops_manager'], ['dispatch@qabnah.test', 'Dispatcher', 'dispatcher'],
    ['support@qabnah.test', 'Support Agent', 'support_agent'], ['review@qabnah.test', 'Onboarding Reviewer', 'onboarding_reviewer'], ['finance@qabnah.test', 'Finance Officer', 'finance'],
    ['finance.manager@qabnah.test', 'Finance Manager', 'finance_manager'], ['analyst@qabnah.test', 'Analyst', 'analyst'],
  ];
  for (const [email, name, role] of staff) {
    const u = await user({ email, name, password: true, locale: 'en' });
    await grant(u.id, role);
  }
  const fleet = await one(pool, `INSERT INTO fleet_partners (name, cr_number, licence_number, contact_name, contact_phone) VALUES ('Sample Fleet Services LLC (fictional)', 'CR-0000000', 'LIC-PENDING', 'Fleet Manager', '+96890009999') RETURNING id`);

  const merchantIds: Record<string, string> = {};
  for (const m of MERCHANTS) {
    const owner = await user({ email: m.owner, name: `${m.en} Owner`, password: true, phone: undefined, locale: 'ar' });
    const zone = await one(pool, `SELECT id FROM zones WHERE code = $1`, [m.zone]);
    const plan = await one(pool, `SELECT id FROM subscription_plans WHERE code = $1`, [m.plan]);
    const row = await one(
      pool,
      `INSERT INTO merchants (slug, name_en, name_ar, category, status, location, address_text, zone_id, plan_id, brand_color, accent_color, tagline_en, tagline_ar, prep_time_minutes,
         opening_hours, contact_phone, contact_email, whatsapp_phone, cr_number, legal_name, approved_at, min_order_baisa, cover_url)
       VALUES ($1,$2,$3,$4,'active', ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$16,$18,$19, now() - interval '30 days', $20, $21) RETURNING id`,
      [m.slug, m.en, m.ar, m.category, m.lng, m.lat, `${m.en}, ${ZONES.find((z) => z.code === m.zone)!.en}, Muscat`, zone.id, plan.id, m.brand, m.accent, m.tagEn, m.tagAr, m.prep,
        JSON.stringify(m.hours), `+9689100${String(MERCHANTS.indexOf(m) + 1).padStart(4, '0')}`, m.owner, `SAMPLE-CR-${MERCHANTS.indexOf(m) + 1}`, `${m.en} (sample data)`, m.category === 'grocery' ? 2000 : 0, sampleUrl(COVER_IMAGES[m.slug])],
    );
    merchantIds[m.slug] = row.id;
    await grant(owner.id, 'merchant_owner', row.id);
    const staffUser = await user({ email: `staff@${m.slug}.qabnah.test`, name: `${m.en} Cashier`, password: true });
    await grant(staffUser.id, 'merchant_staff', row.id);
    await q(pool, `INSERT INTO merchant_subscriptions (merchant_id, plan_id, current_period_end) VALUES ($1,$2, now() + interval '20 days')`, [row.id, plan.id]);
    for (const [i, [en, ar]] of m.banners.entries())
      await q(pool, `INSERT INTO storefront_banners (merchant_id, image_url, title_en, title_ar, sort_order) VALUES ($1,$2,$3,$4,$5)`, [row.id, `${config.MERCHANT_WEB_URL}/brand/banner-${m.category}.svg`, en, ar, i]);
    for (const [ci, [cen, car, products]] of (m.cats as any[]).entries()) {
      const cat = await one(pool, `INSERT INTO categories (merchant_id, name_en, name_ar, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`, [row.id, cen, car, ci]);
      for (const [pi, [pen, par, price, groups, stock]] of (products as any[]).entries()) {
        const p = await one(pool, `INSERT INTO products (merchant_id, category_id, name_en, name_ar, base_price_baisa, sort_order, track_stock, stock_qty, description_en, description_ar, image_url)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [row.id, cat.id, pen, par, price, pi, stock != null, stock ?? 0, PRODUCT_DESCRIPTIONS[pen]?.[0] ?? null, PRODUCT_DESCRIPTIONS[pen]?.[1] ?? null,
          PRODUCT_IMAGES[pen] ? sampleUrl(PRODUCT_IMAGES[pen]) : null]);
        for (const [gi, g] of (groups as any[]).entries()) {
          const grp = await one(pool, `INSERT INTO product_option_groups (product_id, kind, name_en, name_ar, min_select, max_select, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [p.id, g.kind, g.en, g.ar, g.min, g.max, gi]);
          for (const [oi, [oen, oar, delta]] of g.options.entries())
            await q(pool, `INSERT INTO product_options (group_id, name_en, name_ar, price_delta_baisa, sort_order) VALUES ($1,$2,$3,$4,$5)`, [grp.id, oen, oar, delta, oi]);
        }
      }
    }
  }
  // A merchant waiting for approval (for the admin review flow).
  const pendingOwner = await user({ email: 'owner@luban-scents.qabnah.test', name: 'Luban Scents Owner', password: true });
  const mz = await one(pool, `SELECT id FROM zones WHERE code = 'MCT-RUWI'`);
  const pend = await one(pool, `INSERT INTO merchants (slug, name_en, name_ar, category, status, location, address_text, zone_id, cr_number) VALUES ('luban-scents','Luban Scents','عطور اللبان','retail','pending_review',
    ST_SetSRID(ST_MakePoint(58.5665,23.6185),4326)::geography,'Muttrah Corniche (sample)',$1,'SAMPLE-CR-9') RETURNING id`, [mz.id]);
  await grant(pendingOwner.id, 'merchant_owner', pend.id);
  const crFile = await placeholderFile(pendingOwner.id, 'merchant_document');
  await q(pool, `INSERT INTO merchant_documents (merchant_id, doc_type, file_id, number) VALUES ($1,'commercial_registration',$2,'SAMPLE-CR-9')`, [pend.id, crFile]);

  const captainIds: string[] = [];
  const docTypes = ['national_id', 'driving_license', 'vehicle_registration', 'profile_photo', 'vehicle_insurance'];
  for (const c of CAPTAINS) {
    const u = await user({ phone: c.phone, name: c.name });
    await grant(u.id, 'captain');
    const cap = await one(pool, `INSERT INTO captains (user_id, status, employment_model, fleet_partner_id, nationality, vehicle_type, vehicle_make, vehicle_model, vehicle_plate, vehicle_color,
        national_id_number, is_online, max_concurrent, approved_at, rating_avg, rating_count, offers_received, offers_accepted, iban, bank_name)
      VALUES ($1,'active',$2,$3,$4,$5,$6,$7,$8,'White','SAMPLE-ID',true,$9, now() - interval '20 days', $10, 12, 20, 18, 'OM810180000000000000000', 'Sample Bank') RETURNING id`,
      [u.id, c.model, c.model === 'fleet' ? fleet.id : null, c.nat, c.vehicle, c.vehicle === 'bike' ? 'Honda' : c.vehicle === 'van' ? 'Toyota' : 'Nissan', c.vehicle === 'bike' ? 'CG125' : c.vehicle === 'van' ? 'Hiace' : 'Sunny', c.plate, c.vehicle === 'bike' ? 1 : 2, (4.5 + Math.random() * 0.5).toFixed(2)]);
    captainIds.push(cap.id);
    for (const t of docTypes) {
      const f = await placeholderFile(u.id, 'captain_document');
      await q(pool, `INSERT INTO captain_documents (captain_id, doc_type, file_id, number, expires_at, status, reviewed_at) VALUES ($1,$2,$3,'SAMPLE', current_date + 365, 'approved', now())`, [cap.id, t, f]);
    }
    for (const code of c.zones) await q(pool, `INSERT INTO captain_zones (captain_id, zone_id) SELECT $1, id FROM zones WHERE code = $2`, [cap.id, code]);
    for (let d = 0; d < 7; d++) await q(pool, `INSERT INTO captain_availability (captain_id, weekday, start_time, end_time) VALUES ($1,$2,'10:00','23:00')`, [cap.id, d]);
    await recordLocation(pool, cap.id, { lat: c.lat, lng: c.lng });
  }
  // A captain applicant awaiting review.
  const applicant = await user({ phone: '+96890001099', name: 'Hamed Al Wahaibi' });
  await grant(applicant.id, 'captain');
  const appCap = await one(pool, `INSERT INTO captains (user_id, status, nationality, vehicle_type, vehicle_make, vehicle_model, vehicle_plate, national_id_number) VALUES ($1,'pending_review','Omani','car','Toyota','Yaris','99887 W','SAMPLE-ID') RETURNING id`, [applicant.id]);
  for (const t of docTypes) {
    const f = await placeholderFile(applicant.id, 'captain_document');
    await q(pool, `INSERT INTO captain_documents (captain_id, doc_type, file_id, number, expires_at) VALUES ($1,$2,$3,'SAMPLE', current_date + 300)`, [appCap.id, t, f]);
  }
  await q(pool, `INSERT INTO captain_zones (captain_id, zone_id) SELECT $1, id FROM zones WHERE code IN ('MCT-QURUM','MCT-KHUWAIR')`, [appCap.id]);

  const consumers = [];
  const people = [['+96890000001', 'Maryam Al Lawati', 23.6105, 58.4802, 'Qurum', 'Near the PDO roundabout, white villa'], ['+96890000002', 'Khalid Al Habsi', 23.5935, 58.4448, 'Al Khuwair', 'Building 12, opposite the mosque'], ['+96890000003', 'Aisha Al Zadjali', 23.6680, 58.1960, 'Seeb', 'Behind the Sultan Center, blue gate']] as const;
  for (const [phone, name, lat, lng, area, landmark] of people) {
    const u = await user({ phone, name });
    await q(pool, `INSERT INTO addresses (user_id, label, location, area, landmark, contact_name, contact_phone, is_default) VALUES ($1,'home', ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4,$5,$6,$7,true)`, [u.id, lng, lat, area, landmark, name, phone]);
    consumers.push(u.id);
  }
  return { merchantIds, captainIds, consumers };
}

async function seedOrders(ids: { merchantIds: Record<string, string>; captainIds: string[]; consumers: string[] }) {
  const products = async (slug: string) => q(pool, `SELECT p.id, (SELECT array_agg(o.id ORDER BY o.sort_order) FROM product_option_groups g JOIN product_options o ON o.group_id = g.id WHERE g.product_id = p.id AND g.kind = 'variant' AND o.sort_order = 0) AS variant_opts
      FROM products p WHERE p.merchant_id = $1 ORDER BY p.sort_order`, [ids.merchantIds[slug]]);
  const addr = async (userId: string) => one(pool, `SELECT id FROM addresses WHERE user_id = $1`, [userId]);
  const admin = await one(pool, `SELECT id FROM users WHERE email = 'admin@qabnah.test'`);
  const ownerOf = async (slug: string) => (await one(pool, `SELECT ur.user_id FROM user_roles ur WHERE ur.merchant_id = $1`, [ids.merchantIds[slug]])).user_id;
  const plan: { slug: string; consumer: number; captain: number; daysAgo: number; outcome: 'delivered' | 'cancelled' }[] = [];
  const slugs = ['saffron-grill', 'qahwa-house', 'saffron-grill', 'ward-flowers', 'qahwa-house'];
  const captainFor: Record<string, number[]> = { 'saffron-grill': [0, 3], 'qahwa-house': [1, 5], 'ward-flowers': [0, 3], 'nakheel-market': [2, 4] };
  for (let i = 0; i < 28; i++) {
    const slug = i % 7 === 6 ? 'nakheel-market' : slugs[i % slugs.length];
    const consumer = slug === 'nakheel-market' ? 2 : i % 2;
    plan.push({ slug, consumer, captain: captainFor[slug][i % 2], daysAgo: Math.floor(i / 2), outcome: i % 9 === 8 ? 'cancelled' : 'delivered' });
  }
  for (const p of plan) {
    const prods = await products(p.slug);
    const items = prods.slice(0, 2).map((pr, k) => ({ productId: pr.id, quantity: k + 1, optionIds: (pr.variant_opts ?? []).filter(Boolean) }));
    const userId = ids.consumers[p.consumer];
    const a = await addr(userId);
    // Pretend the store is open at seed time.
    await q(pool, `UPDATE merchants SET opening_hours = '[]' WHERE slug = $1`, [p.slug]);
    const orderId = await tx((c) => createMarketplaceOrder(c, userId, { merchantId: ids.merchantIds[p.slug], items, addressId: a.id, paymentMethod: 'cod' }));
    const owner = await ownerOf(p.slug);
    if (p.outcome === 'cancelled') {
      await tx((c) => merchantOrderAction(c, ids.merchantIds[p.slug], orderId, 'reject', owner, { reason: 'Item out of stock' }));
    } else {
      await tx((c) => merchantOrderAction(c, ids.merchantIds[p.slug], orderId, 'accept', owner, { prepTimeMinutes: 15 }));
      const d = await one(pool, `SELECT id FROM deliveries WHERE order_id = $1`, [orderId]);
      await q(pool, `UPDATE delivery_offers SET status = 'cancelled' WHERE delivery_id = $1 AND status = 'pending'`, [d.id]);
      const capId = ids.captainIds[p.captain];
      const capUser = (await one(pool, `SELECT user_id FROM captains WHERE id = $1`, [capId])).user_id;
      await tx((c) => manualAssign(c, d.id, capId, admin.id));
      await tx((c) => merchantOrderAction(c, ids.merchantIds[p.slug], orderId, 'ready', owner, {}));
      await tx((c) => captainAction(c, capId, capUser, d.id, 'arrive_pickup', {}));
      await tx((c) => captainAction(c, capId, capUser, d.id, 'pickup', {}));
      const pin = (await one(pool, `SELECT delivery_pin FROM deliveries WHERE id = $1`, [d.id])).delivery_pin;
      await tx((c) => completeDelivery(c, capId, capUser, d.id, { pin, recipientName: 'Customer' }));
    }
    // Spread history over the past two weeks (Muscat lunch/dinner times).
    const shift = `${p.daysAgo} days ${(plan.indexOf(p) % 5) + 1} hours`;
    for (const [t, cols] of [['orders', ['created_at', 'placed_at', 'accepted_at', 'ready_at', 'delivered_at', 'cancelled_at', 'updated_at']], ['deliveries', ['created_at', 'assigned_at', 'at_pickup_at', 'picked_up_at', 'delivered_at', 'updated_at']]] as const) {
      const key = t === 'orders' ? 'id' : 'order_id';
      await q(pool, `UPDATE ${t} SET ${cols.map((c) => `${c} = ${c} - $2::interval`).join(', ')} WHERE ${key} = $1`, [orderId, shift]);
    }
    if (p.outcome === 'delivered') {
      // Give history realistic durations (the seed runs the flow instantly): assign ~2 min, ready ~15 min, deliver ~30–45 min after placing.
      const mins = 30 + (plan.indexOf(p) % 4) * 5;
      await q(pool, `UPDATE orders SET accepted_at = placed_at + interval '1 minute', ready_at = placed_at + interval '15 minutes',
        delivered_at = placed_at + make_interval(mins => $2), updated_at = placed_at + make_interval(mins => $2) WHERE id = $1`, [orderId, mins]);
      await q(pool, `UPDATE deliveries d SET assigned_at = o.placed_at + interval '2 minutes', at_pickup_at = o.placed_at + interval '14 minutes',
        picked_up_at = o.placed_at + interval '16 minutes', delivered_at = o.delivered_at, updated_at = o.delivered_at FROM orders o WHERE o.id = d.order_id AND d.order_id = $1`, [orderId]);
    }
    await q(pool, `UPDATE ledger_entries SET created_at = created_at - $2::interval WHERE order_id = $1`, [orderId, shift]);
    await q(pool, `UPDATE order_status_history SET created_at = created_at - $2::interval WHERE order_id = $1`, [orderId, shift]);
  }
  for (const m of MERCHANTS) await q(pool, `UPDATE merchants SET opening_hours = $2 WHERE slug = $1`, [m.slug, JSON.stringify(m.hours)]);

  // Live examples right now: an order waiting for the store, a merchant delivery being dispatched, and a C2C parcel.
  await q(pool, `UPDATE merchants SET opening_hours = '[]' WHERE slug = 'saffron-grill'`);
  const prods = await products('saffron-grill');
  const a0 = await addr(ids.consumers[0]);
  await tx((c) => createMarketplaceOrder(c, ids.consumers[0], { merchantId: ids.merchantIds['saffron-grill'], items: [{ productId: prods[0].id, quantity: 2, optionIds: prods[0].variant_opts }], addressId: a0.id, paymentMethod: 'cod', notes: 'Please ring the bell twice' }));
  await q(pool, `UPDATE merchants SET opening_hours = $2 WHERE slug = $1`, ['saffron-grill', JSON.stringify(MERCHANTS[0].hours)]);
  const owner = await ownerOf('ward-flowers');
  await tx((c) => createMerchantDelivery(c, owner, ids.merchantIds['ward-flowers'], {
    dropoff: { location: { lat: 23.6005, lng: 58.4300 }, address: 'Al Khuwair 33, villa 7', contactName: 'Noor', contactPhone: '+96890000004' },
    codAmountBaisa: 12500, packageDescription: 'Bouquet — handle with care (Instagram order)',
  }));
  await tx((c) => createShipment(c, ids.consumers[1], {
    pickup: { location: { lat: 23.5935, lng: 58.4448 }, address: 'Al Khuwair, building 12' },
    dropoff: { location: { lat: 23.6105, lng: 58.4802 }, address: 'Qurum, white villa', contactName: 'Maryam', contactPhone: '+96890000001' },
    package: { size: 'small', description: 'House keys in an envelope' }, paymentMethod: 'cod', codPayer: 'sender',
  }));
  // A support ticket and a settlement draft for the finance flow.
  const t = await one(pool, `INSERT INTO support_tickets (requester_user_id, category, subject, priority) VALUES ($1,'order_issue','Missing laban in my order','normal') RETURNING id`, [ids.consumers[1]]);
  await q(pool, `INSERT INTO support_messages (ticket_id, author_user_id, body) VALUES ($1,$2,'The laban was not in the bag. Can you help?')`, [t.id, ids.consumers[1]]);
}

export async function seed() {
  if (config.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');
  await migrate(config.DATABASE_URL, () => {});
  if (process.env.SEED_IF_EMPTY === 'true') {
    const existing = await one(pool, `SELECT count(*)::int AS n FROM merchants`);
    if (existing.n > 0) return { skipped: true, reason: 'database already has data (set SEED_IF_EMPTY=false to wipe and reseed)' };
  }
  await wipe();
  await seedReference();
  const ids = await seedPeople();
  await seedOrders(ids);
  const counts = await one(pool, `SELECT (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM merchants)::int AS merchants, (SELECT count(*) FROM captains)::int AS captains, (SELECT count(*) FROM ledger_entries)::int AS ledger`);
  return counts;
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed()
    .then((c) => { console.log('Seed complete:', c, `\nDev password for all staff/merchant e-mail accounts: ${DEV_PASSWORD}`); return pool.end(); })
    .catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
}
