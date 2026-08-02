/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mock-data-only foundation stage: no external image domains, no rewrites
  // to external services (Supabase/n8n/AI) are configured yet. See README
  // for notes on wiring those up in a later stage.
};

export default nextConfig;
