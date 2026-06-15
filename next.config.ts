import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
    // Désactivé : ce cache disque (actif par défaut depuis Next 16.1) provoque une fuite mémoire
    // qui fait croître le heap Turbopack jusqu'au crash OOM après ~30 min de dev.
    turbopackFileSystemCacheForDev: false,
  },
};

export default withNextIntl(nextConfig);
