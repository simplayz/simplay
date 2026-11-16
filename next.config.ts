import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  // Arena preview hosts only; does not relax API same-origin checks.
  allowedDevOrigins: ['*.e2b.app'],
};
export default config;
