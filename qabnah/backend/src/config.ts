import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/qabnah'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  MERCHANT_WEB_URL: z.string().default('http://localhost:5173'),
  ADMIN_WEB_URL: z.string().default('http://localhost:5174'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  JWT_SECRET: z.string().min(32).default('dev-only-insecure-jwt-secret-change-me-0123456789'),
  ACCESS_TOKEN_TTL_S: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  OTP_PEPPER: z.string().default('dev-only-otp-pepper'),
  OTP_DEV_ECHO: bool.default(false),
  FILE_SIGNING_SECRET: z.string().default('dev-only-file-signing-secret'),
  STORAGE_DIR: z.string().default('./storage'),
  LOG_LEVEL: z.string().default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).default(300), // per user (or IP when anonymous); auth routes are stricter
  LOCATION_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(12).default(120), // captain REST location pings
  // providers
  PAYMENT_PROVIDER: z.enum(['mock', 'thawani']).default('mock'),
  THAWANI_BASE_URL: z.string().default('https://uatcheckout.thawani.om/api/v1'),
  THAWANI_CHECKOUT_URL: z.string().default('https://uatcheckout.thawani.om/pay'),
  THAWANI_SECRET_KEY: z.string().optional(),
  THAWANI_PUBLISHABLE_KEY: z.string().optional(),
  SMS_PROVIDER: z.enum(['console', 'http']).default('console'),
  SMS_HTTP_URL: z.string().optional(),
  SMS_HTTP_TOKEN: z.string().optional(),
  SMS_SENDER_ID: z.string().default('Qabnah'),
  WHATSAPP_PROVIDER: z.enum(['console', 'cloud']).default('console'),
  WHATSAPP_GRAPH_VERSION: z.string().default('v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  PUSH_PROVIDER: z.enum(['console', 'live']).default('console'),
  // FCM HTTP v1 (Android): service-account JSON, base64-encoded
  FCM_SERVICE_ACCOUNT_JSON_B64: z.string().optional(),
  // APNs token auth (iOS): .p8 key base64-encoded, key id, team id, bundle ids
  APNS_KEY_P8_B64: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID_CONSUMER: z.string().default('om.qabnah.consumer'),
  APNS_BUNDLE_ID_CAPTAIN: z.string().default('om.qabnah.captain'),
  APNS_PRODUCTION: bool.default(false),
  // Admin multi-factor authentication
  REQUIRE_ADMIN_MFA: bool.default(false),
  MFA_ENCRYPTION_KEY: z.string().default('dev-only-mfa-encryption-key'),
  // File storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('me-central-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),
  // Routing (fees/ETAs)
  ROUTING_PROVIDER: z.enum(['haversine', 'osrm']).default('haversine'),
  OSRM_URL: z.string().optional(),
  RUN_WORKER_IN_PROCESS: bool.default(false),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cfg = schema.parse(env);
  if (cfg.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (cfg.OTP_DEV_ECHO) problems.push('OTP_DEV_ECHO must be false in production');
    if (cfg.PAYMENT_PROVIDER === 'mock') problems.push('PAYMENT_PROVIDER=mock is not allowed in production');
    if (cfg.JWT_SECRET.startsWith('dev-only')) problems.push('JWT_SECRET must be set');
    if (cfg.OTP_PEPPER.startsWith('dev-only')) problems.push('OTP_PEPPER must be set');
    if (cfg.FILE_SIGNING_SECRET.startsWith('dev-only')) problems.push('FILE_SIGNING_SECRET must be set');
    if (cfg.SMS_PROVIDER === 'console') problems.push('SMS_PROVIDER=console cannot deliver OTPs in production');
    if (!cfg.REQUIRE_ADMIN_MFA) problems.push('REQUIRE_ADMIN_MFA must be true in production');
    if (cfg.MFA_ENCRYPTION_KEY.startsWith('dev-only')) problems.push('MFA_ENCRYPTION_KEY must be set');
    if (cfg.STORAGE_DRIVER === 's3' && (!cfg.S3_BUCKET || !cfg.S3_ACCESS_KEY_ID || !cfg.S3_SECRET_ACCESS_KEY)) problems.push('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for STORAGE_DRIVER=s3');
    if (cfg.ROUTING_PROVIDER === 'osrm' && !cfg.OSRM_URL) problems.push('OSRM_URL is required for ROUTING_PROVIDER=osrm');
    if (cfg.PAYMENT_PROVIDER === 'thawani' && (!cfg.THAWANI_SECRET_KEY || !cfg.THAWANI_PUBLISHABLE_KEY))
      problems.push('THAWANI_SECRET_KEY and THAWANI_PUBLISHABLE_KEY are required');
    if (problems.length) throw new Error('Unsafe production configuration:\n- ' + problems.join('\n- '));
  }
  return cfg;
}

export const config: Config = loadConfig();
