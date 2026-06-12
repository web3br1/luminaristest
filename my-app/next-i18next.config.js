/** @type {import('next-i18next').UserConfig} */
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt'],
  },
  defaultNS: 'common',
  ns: ['common', 'database', 'analytics', 'chatMessages', 'finance_view', 'inventory_view', 'products_view'],
  reloadOnPrerender: process.env.NODE_ENV === 'development',
};
