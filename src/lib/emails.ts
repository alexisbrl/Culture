// ─── Emails transactionnels Culture ──────────────────────────────────────────
// Layout commun (en-tête 🪴 Culture + pied de page) + builders par email.
// Chaque builder renvoie { subject, html } à passer tel quel à Resend.
//
// ⚠️ Les couleurs sont en HEX littéral (et non via les tokens de `theme.ts`) :
// les clients mail ne supportent pas les variables CSS, tout doit être inline.

export const EMAIL_FROM = 'Culture <onboarding@resend.dev>';

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
export function deletionCodeEmail(args: { ownerName: string; workshopName: string; code: string }): EmailContent {
  return {
    subject: `🗑️ Code de suppression : ${args.code}`,
    html: layout('Confirmation de suppression', `
      ${p(`Bonjour ${args.ownerName},`)}
      ${p(`Vous avez demandé la suppression de l'atelier <strong style="color: #111827;">"${args.workshopName}"</strong>.`)}
      ${p('Voici votre code de confirmation :')}
      <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #5f8a3f;">${args.code}</span>
      </div>
      <p style="color: #9ca3af; font-size: 13px;">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    `),
  };
}

/** Email : notification de mise en corbeille d'un atelier. */
export function workshopTrashedEmail(args: { ownerName: string; workshopName: string; actionBy: string }): EmailContent {
  return {
    subject: `🗑️ Atelier "${args.workshopName}" mis en corbeille`,
    html: layout('Atelier mis en corbeille', `
      ${p(`Bonjour ${args.ownerName},`)}
      ${p(`L'atelier <strong style="color: #111827;">"${args.workshopName}"</strong> a été mis en corbeille par <strong>${args.actionBy}</strong>.`)}
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="color: #92400e; margin: 0; font-size: 14px;">⏳ Cet atelier sera <strong>définitivement supprimé dans 7 jours</strong> si aucune restauration n'est effectuée.</p>
      </div>
      ${p(`Si c'est une erreur, connectez-vous sur <a href="https://scellow.com" style="color: #5f8a3f;">scellow.com</a> et restaurez l'atelier depuis la <strong style="color: #111827;">corbeille</strong>, tout en bas de votre tableau de bord.`)}
    `),
  };
}
