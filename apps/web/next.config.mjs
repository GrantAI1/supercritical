/** @type {import('next').NextConfig} */
const NEXT_CONFIG = {
    transpilePackages: [
        "@supercritical/db",
        "@supercritical/core",
        "@supercritical/crypto",
        "@supercritical/ingest",
    ],
    experimental: {
        serverComponentsExternalPackages: [
            "@prisma/client",
            "@neondatabase/serverless",
            "ws",
        ],
    },
};

export default NEXT_CONFIG;
