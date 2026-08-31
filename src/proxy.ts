import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// Routes qui nécessitent d'être connecté
const isProtectedRoute = createRouteMatcher([
  '/:locale/creer-atelier(.*)',
  '/:locale/create(.*)',
  '/:locale/profile(.*)',
  '/:locale/dashboard(.*)',
  '/:locale/workshops(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // Protection des routes privées
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  // ─── Les routes d'API passent par Clerk, jamais par l'i18n ────────────────
  //
  // Elles n'ont pas de langue : les faire traverser next-intl les ferait
  // rediriger vers `/fr/api/...`. Elles ont en revanche besoin que
  // `clerkMiddleware` soit passé, faute de quoi `auth()` lève à l'intérieur —
  // ce qui a rendu la recharge automatique de questions inopérante du
  // 29/08/2026 au 30/08/2026 : le filtre ci-dessous excluait `api`, la route
  // répondait 500 (« auth() was called but Clerk can't detect usage of
  // clerkMiddleware »), et personne n'attendait sa réponse. Toute future route
  // d'API authentifiée dépend de cette ligne.
  if (req.nextUrl.pathname.startsWith('/api')) return;

  // Internationalisation
  return intlMiddleware(req);
});

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)', '/api/:path*'],
};
