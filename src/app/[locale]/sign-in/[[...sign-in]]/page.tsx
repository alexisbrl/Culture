import { SignIn } from '@clerk/nextjs';
import { getLocale } from 'next-intl/server';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const locale = await getLocale();
  const { reason } = await searchParams;

  return (
    <section className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-16 px-4">
      <div className="w-full max-w-md">
        {/* Bannière : déconnexion car le compte a été utilisé ailleurs */}
        {reason === 'session_revoked' && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {locale === 'fr'
              ? 'Vous avez été déconnecté car votre compte a été utilisé sur un autre appareil.'
              : 'You were signed out because your account was used on another device.'}
          </div>
        )}

        {/* Header au-dessus du formulaire Clerk */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {locale === 'fr' ? 'Bon retour 👋' : 'Welcome back 👋'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {locale === 'fr'
              ? 'Connectez-vous pour accéder à vos ateliers'
              : 'Sign in to access your workshops'}
          </p>
        </div>

        {/* Composant Clerk — gère tout automatiquement */}
        <SignIn
          fallbackRedirectUrl={`/${locale}/dashboard`}
          signUpFallbackRedirectUrl={`/${locale}/dashboard`}
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-sm border border-gray-100 rounded-2xl w-full',
              headerTitle: 'hidden',
              headerSubtitle: 'hidden',
              socialButtonsBlockButton:
                'border border-gray-200 hover:bg-gray-50 rounded-xl h-11',
              formButtonPrimary:
                'gradient-primary hover:opacity-90 rounded-xl h-11 text-sm font-semibold',
              formFieldInput:
                'rounded-xl border-gray-200 h-11 focus:ring-violet-500 focus:border-violet-500',
              footerActionLink: 'text-violet-600 hover:text-violet-700',
            },
          }}
        />
      </div>
    </section>
  );
}
