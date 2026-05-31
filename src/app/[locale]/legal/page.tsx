import { useTranslations } from 'next-intl';
import { getLocale } from 'next-intl/server';

export default async function LegalPage() {
  const locale = await getLocale();
  return <LegalPageClient locale={locale} />;
}

function LegalPageClient({ locale }: { locale: string }) {
  const t = useTranslations('legal');

  return (
    <section className="py-20 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('title')}</h1>
        <p className="text-sm text-gray-500 mb-12">{t('lastUpdated')}</p>

        {locale === 'fr' ? (
          <div className="prose prose-gray max-w-none space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Éditeur du site</h2>
              <p className="text-gray-600 leading-relaxed">
                Le site Culture (accessible temporairement via scellow.com) est édité à titre personnel dans le cadre d'un projet en phase bêta. Toute information de contact est disponible via la page Contact.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Données personnelles</h2>
              <p className="text-gray-600 leading-relaxed">
                Les données collectées via le formulaire de liste d'attente (prénom, email, rôle) sont utilisées uniquement pour vous contacter dans le cadre du programme bêta. Elles ne sont jamais vendues ni partagées avec des tiers. Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression. Pour exercer ces droits : contact@evalia.app.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Cookies</h2>
              <p className="text-gray-600 leading-relaxed">
                Ce site utilise des cookies fonctionnels essentiels uniquement. Aucun cookie publicitaire ou de tracking tiers n'est utilisé à ce stade.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Propriété intellectuelle</h2>
              <p className="text-gray-600 leading-relaxed">
                L'ensemble du contenu de ce site (textes, visuels, marque Culture) est protégé. Toute reproduction sans autorisation est interdite.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Limitation de responsabilité</h2>
              <p className="text-gray-600 leading-relaxed">
                Le site est fourni en l'état, dans le cadre d'une phase bêta. L'éditeur ne peut être tenu responsable des interruptions de service ou des informations inexactes.
              </p>
            </div>
          </div>
        ) : (
          <div className="prose prose-gray max-w-none space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Publisher</h2>
              <p className="text-gray-600 leading-relaxed">
                The Culture website (temporarily accessible via scellow.com) is published personally as part of a beta-phase project. Contact information is available via the Contact page.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Personal Data</h2>
              <p className="text-gray-600 leading-relaxed">
                Data collected through the waitlist form (first name, email, role) is used solely to contact you regarding the beta program. It is never sold or shared with third parties. Under GDPR, you have the right to access, correct, or delete your data. To exercise these rights: contact@evalia.app.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Cookies</h2>
              <p className="text-gray-600 leading-relaxed">
                This site uses essential functional cookies only. No advertising or third-party tracking cookies are used at this stage.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Intellectual Property</h2>
              <p className="text-gray-600 leading-relaxed">
                All site content (texts, visuals, Culture brand) is protected. Reproduction without permission is prohibited.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Limitation of Liability</h2>
              <p className="text-gray-600 leading-relaxed">
                The site is provided as-is during a beta phase. The publisher cannot be held liable for service interruptions or inaccurate information.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
