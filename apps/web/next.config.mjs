/** @type {import('next').NextConfig} */
const NEXT_CONFIG = {
    transpilePackages: [
        "@supercritical/db",
        "@supercritical/core",
        "@supercritical/crypto",
        "@supercritical/ingest",
    ],
    experimental: {
        serverComponentsExternalPackages: ["@prisma/client"],
    },
};

export default NEXT_CONFIG;
