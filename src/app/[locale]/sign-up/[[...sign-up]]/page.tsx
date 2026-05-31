import { SignUp } from '@clerk/nextjs';
import { getLocale } from 'next-intl/server';

export default async function SignUpPage() {
  const locale = await getLocale();

  return (
    <section className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-16 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {locale === 'fr' ? 'Créez votre compte 🚀' : 'Create your account 🚀'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {locale === 'fr'
              ? 'Rejoignez Culture et créez votre premier atelier'
              : 'Join Culture and create your first workshop'}
          </p>
        </div>

        {/* Composant Clerk */}
        <SignUp
          fallbackRedirectUrl={`/${locale}/create`}
          signInFallbackRedirectUrl={`/${locale}/sign-in`}
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
