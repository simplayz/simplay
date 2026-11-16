import type { NextConfig } from "next";

const configuredDevOrigins = (process.env.SIMPLAYZ_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// Binding to 0.0.0.0 makes 127.0.0.1 a distinct dev origin from Next's
// default localhost allowlist. Keep loopback allowed; preview hosts stay opt-in.
const allowedDevOrigins = [...new Set(["127.0.0.1", ...configuredDevOrigins])];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  ...(allowedDevOrigins.length ? { allowedDevOrigins } : {}),
};

export default nextConfig;
