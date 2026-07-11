// ─── Emails transactionnels Culture ──────────────────────────────────────────
// Layout commun (en-tête 🪴 Culture + pied de page) + builders par email.
// Chaque builder renvoie { subject, html } à passer tel quel à Resend.
//
// ⚠️ Les couleurs sont en HEX littéral (et non via les tokens de `theme.ts`) :
// les clients mail ne supportent pas les variables CSS, tout doit être inline.
//
// i18n : chaque builder est `async` et prend la `locale` du DESTINATAIRE (pas de
// celui qui déclenche l'action) — un email envoyé à plusieurs personnes est
// construit une fois par destinataire, chacun dans sa langue. Les textes vivent
// dans `messages/{fr,en}.json` sous le namespace `emails`, lus via
// `getTranslations({ locale })` (locale explicite → hors contexte de requête OK).
// next-intl interdit les balises HTML dans un message `t()` simple : les libellés
// restent du texte pur, toute mise en forme (gras, lien, boutons) vit ici.

import { getTranslations } from 'next-intl/server';

export const EMAIL_FROM = 'Culture <onboarding@resend.dev>';

export type EmailLocale = 'fr' | 'en';
export type EmailContent = { subject: string; html: string };

/** Enveloppe commune : conteneur + en-tête de marque + contenu + pied de page. */
function layout(title: string, contentHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px;">🪴</span>
        <h1 style="color: #5f8a3f; font-size: 24px; margin: 8px 0;">Culture</h1>
      </div>
      <h2 style="color: #111827; font-size: 18px;">${title}</h2>
      ${contentHtml}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #d1d5db; font-size: 12px; text-align: center;">© Culture · scellow.com</p>
    </div>
  `;
}

/** Paragraphe de corps standard. */
const p = (html: string) => `<p style="color: #6b7280;">${html}</p>`;

/** Email : code de confirmation de suppression d'atelier. */
export async function deletionCodeEmail(args: {
  ownerName: string;
  workshopName: string;
  code: string;
  locale: EmailLocale;
}): Promise<EmailContent> {
  const t = await getTranslations({ locale: args.locale, namespace: 'emails' });
  return {
    subject: t('deletion.subject', { code: args.code }),
    html: layout(t('deletion.title'), `
      ${p(t('deletion.greeting', { name: args.ownerName }))}
      ${p(t('deletion.intro', { workshop: args.workshopName }))}
      ${p(t('deletion.codeLabel'))}
      <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #5f8a3f;">${args.code}</span>
      </div>
      <p style="color: #9ca3af; font-size: 13px;">${t('deletion.expiry')}</p>
    `),
  };
}

/** Email : notification de mise en corbeille d'un atelier. */
export async function workshopTrashedEmail(args: {
  ownerName: string;
  workshopName: string;
  actionBy: string;
  locale: EmailLocale;
}): Promise<EmailContent> {
  const t = await getTranslations({ locale: args.locale, namespace: 'emails' });
  return {
    subject: t('trashed.subject', { workshop: args.workshopName }),
    html: layout(t('trashed.title'), `
      ${p(t('trashed.greeting', { name: args.ownerName }))}
      ${p(t('trashed.intro', { workshop: args.workshopName, actionBy: args.actionBy }))}
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="color: #92400e; margin: 0; font-size: 14px;">${t('trashed.warning')}</p>
      </div>
      ${p(t('trashed.restore'))}
      <div style="text-align: center; margin: 24px 0;">
        <a href="https://scellow.com" style="display: inline-block; background: #5f8a3f; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 10px;">${t('trashed.restoreCta')}</a>
      </div>
    `),
  };
}
