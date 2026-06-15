/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  reactStrictMode: true,

  // Disable the dev "static route" indicator overlay. Its client handler
  // (`handleStaticIndicator`) crashes on the `isrManifest` HMR message in this
  // Next version, aborting client bootstrap before React hydrates — leaving the
  // page stuck on the SSR'd loading state ("Authenticating…"). Dev-only toggle.
  devIndicators: false,

  eslint: {
    ignoreDuringBuilds: true,
  },

  i18n: {
    ...i18n,
    localeDetection: false,
  },

  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api',
  },
};

module.exports = nextConfig;