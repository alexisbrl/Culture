import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // `hasLocale` narrow le type sur l'union `Locale` ('fr' | 'en') exigée par AppConfig
  // (cf. src/i18n/types.ts), sinon repli sur la locale par défaut.
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
