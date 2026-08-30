import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { palette } from '@/lib/theme';
import { getWorkshop, getMemberGroups } from '@/app/actions/workshops';
import { getWorkshopFiles } from '@/app/actions/workshopFiles';
import { getWorkshopNotions } from '@/app/actions/workshopNotions';
import { getWorkshopChapters } from '@/app/actions/workshopChapters';
import SettingsClient from './SettingsClient';
import MembersSection from './MembersSection';
import FilesSection from './FilesSection';
import NotionsSection from './NotionsSection';
import { isNavSection } from './sections';
import type { Member } from './settingsShared';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
};

// ─── Ce qui bloque l'affichage, et ce qui ne le bloque plus ──────────────────
//
// La page attendait les membres, les fichiers, les notions ET les chapitres
// avant de dessiner quoi que ce soit — 1,3 à 2,6 s en production (mesuré le
// 30/08/2026) pour un écran qui s'ouvre toujours sur « Général », lequel n'a
// besoin que de l'atelier lui-même.
//
// Désormais seul l'atelier est attendu : la coquille et « Général » partent
// immédiatement, les trois sections lourdes arrivent en flux derrière, chacune
// dans sa propre frontière de chargement. Un onglet ouvert trop tôt montre une
// silhouette de contenu, jamais un écran blanc.
//
// ⚠️ Les sections restent montées en permanence côté client (voir
// SettingsClient et .claude/rules/server-architecture.md) : on ne diffère que
// leur ARRIVÉE, jamais leur montage. Une fois là, elles y restent.

export default async function SettingsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { section } = await searchParams;
  // `auth()` et non `currentUser()` : la seconde appelle l'API de Clerk sur le
  // réseau pour rapporter tout le profil, alors qu'on ne pose ici qu'une
  // question — « est-il connecté ? » — à laquelle le jeton de session répond
  // déjà, sans sortir du serveur.
  const [{ userId }, locale] = await Promise.all([auth(), getLocale()]);

  if (!userId) redirect(`/${locale}/sign-in`);

  const workshop = await getWorkshop(id);
  if (!workshop) notFound();

  // Paramètres accessibles à tous les rôles : l'engrenage est un lien direct vers
  // cette page, qui rend une version réduite en lecture seule pour un membre simple.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members: Member[] = (workshop.workshop_members as any[]).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role as 'owner' | 'manager' | 'member',
    joinedAt: m.joined_at,
    displayName: m.user_profiles?.display_name ?? 'Utilisateur',
    uniqueTag: m.user_profiles?.unique_tag ?? '',
    groupIds: m.groups ?? [],
  }));

  // L'onglet ouvert est lu ici, côté serveur, pour que la page arrive déjà sur
  // le bon : le lire côté navigateur faisait apparaître « Général » un instant
  // avant de basculer, à chaque rafraîchissement.
  const initialSection = isNavSection(section) ? section : 'general';

  return (
    <SettingsClient
      locale={locale}
      workshopId={workshop.id}
      workshopName={workshop.name}
      description={workshop.description}
      coverGradient={workshop.cover_gradient}
      coverImageUrl={workshop.cover_image_url}
      coverImageActive={workshop.cover_image_active}
      emoji={workshop.emoji}
      createdAt={workshop.created_at}
      uniqueTag={workshop.unique_tag}
      currentUserRole={workshop.currentUserRole}
      isPremium={workshop.is_premium}
      showProgramme={workshop.show_programme}
      initialSection={initialSection}
      memberCount={members.length}
      membersSlot={
        <Suspense fallback={<SectionSkeleton rows={5} />}>
          <MembersSlot
            workshopId={id}
            isPremium={workshop.is_premium}
            currentUserRole={workshop.currentUserRole}
            members={members}
          />
        </Suspense>
      }
      filesSlot={
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <FilesSlot workshopId={id} />
        </Suspense>
      }
      notionsSlot={
        <Suspense fallback={<SectionSkeleton rows={4} />}>
          <NotionsSlot workshopId={id} />
        </Suspense>
      }
    />
  );
}

// ─── Les trois sections qui arrivent en flux ─────────────────────────────────
//
// Chacune ne demande que sa propre tranche de données : c'est ce qui permet à
// la plus lente de ne retenir qu'elle-même. Les membres, eux, viennent déjà de
// l'atelier — seule leur liste de groupes se fait attendre.

async function MembersSlot({
  workshopId,
  isPremium,
  currentUserRole,
  members,
}: {
  workshopId: string;
  isPremium: boolean;
  currentUserRole: Member['role'];
  members: Member[];
}) {
  const groups = await getMemberGroups(workshopId);
  return (
    <MembersSection
      workshopId={workshopId}
      isPremium={isPremium}
      currentUserRole={currentUserRole}
      members={members}
      groups={groups}
    />
  );
}

async function FilesSlot({ workshopId }: { workshopId: string }) {
  const files = await getWorkshopFiles(workshopId);
  return <FilesSection workshopId={workshopId} initialFiles={files} />;
}

async function NotionsSlot({ workshopId }: { workshopId: string }) {
  const [notions, chapters] = await Promise.all([
    getWorkshopNotions(workshopId),
    getWorkshopChapters(workshopId),
  ]);
  return <NotionsSection workshopId={workshopId} notions={notions} chapters={chapters} />;
}

/** Silhouette d'une section pas encore arrivée : mêmes dimensions qu'une carte
 *  de contenu (SectionCard), pour que rien ne saute quand le vrai contenu
 *  prend sa place. Aucun texte — donc rien à traduire, et rien à lire pour un
 *  lecteur d'écran, qui n'a que faire d'un contenu en cours d'arrivée. */
function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div style={{ marginBottom: 36 }} className="animate-pulse" aria-hidden>
      <div style={{ height: 15, width: 150, borderRadius: 7, background: palette.line, marginBottom: 14 }} />
      <div
        style={{
          background: palette.surfaceRaised,
          borderRadius: 14,
          border: `1px solid ${palette.line}`,
          padding: '6px 18px',
        }}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '18px 0',
              borderBottom: i === rows - 1 ? 'none' : `1px solid ${palette.line}`,
            }}
          >
            <div style={{ height: 11, width: `${38 + ((i * 17) % 28)}%`, borderRadius: 6, background: palette.line }} />
            <div style={{ height: 11, width: 58, borderRadius: 6, background: palette.line }} />
          </div>
        ))}
      </div>
    </div>
  );
}
