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

  // Internationalisation
  return intlMiddleware(req);
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
