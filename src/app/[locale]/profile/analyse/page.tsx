import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { palette } from '@/lib/theme';

// État vide « V2 » de l'analyse, indépendante de tout atelier (T39 — périmètre
// révisé par Alexis : plus de tableau de bord par atelier, une seule page de
// suivi rattachée au profil). Voir docs/chantiers/2026-08-05-refonte-ui-design-system.md.
export default async function ProfileAnalysePage() {
  const user = await currentUser();
  const locale = await getLocale();
  if (!user) redirect(`/${locale}/sign-in`);

  const t = await getTranslations('analyse');

  return (
    <div style={{ minHeight: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24, background: palette.cream }}>
      <div style={{ fontWeight: 600, fontSize: 26, color: palette.ink }}>{t('title')}</div>
      <Badge tone="premium">V2</Badge>
    </div>
  );
}
