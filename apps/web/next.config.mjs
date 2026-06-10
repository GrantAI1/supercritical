/** @type {import('next').NextConfig} */
const NEXT_CONFIG = {
  transpilePackages: ["@supercritical/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"]
  }
};

export default NEXT_CONFIG;
