import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prisma (driver adapters + query compiler) and ExcelJS must stay outside the
  // server bundle: they rely on Node APIs and native/wasm assets.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "exceljs"],
  typedRoutes: false,
};

export default nextConfig;
