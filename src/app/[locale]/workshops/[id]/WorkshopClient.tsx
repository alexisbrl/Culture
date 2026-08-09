'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import WorkshopSwitcher from '@/components/WorkshopSwitcher';
import WorkshopActionsMenu from '@/components/WorkshopActionsMenu';
import ProgrammeTab from './tabs/ProgrammeTab';
import type { Chapter } from '@/app/actions/workshopChapters';
import type { ParcoursProgress } from '@/app/actions/parcoursProgress';
import ExamenTab from './tabs/ExamenTab';
import CoursTab from './tabs/CoursTab';
import { palette } from '@/lib/theme';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  createdAt: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'manager' | 'member';
  isPremium: boolean;
  members: { id: string; userId: string; role: 'owner' | 'manager' | 'member'; joinedAt: string; displayName: string; uniqueTag: string }[];
  chapters: Chapter[];
  progress: ParcoursProgress;
};

type TabId = 'programme' | 'examen' | 'cours';

export default function WorkshopClient({ workshopId, workshopName, currentUserRole, chapters, progress }: Props) {
  const searchParams = useSearchParams();
  // Propriétaire ou gestionnaire : accès aux onglets de gestion + paramètres.
  const canManage = currentUserRole === 'owner' || currentUserRole === 'manager';
  // La navigation entre onglets vit désormais dans la barre du haut globale
  // (DashboardHeader, T12) — cet onglet ne fait plus que lire l'URL (?tab=).
  const activeTab = (searchParams.get('tab') as TabId | null) ?? 'programme';

  const [mobileSwitcherOpen, setMobileSwitcherOpen] = useState(false);

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: palette.ink, minHeight: 'calc(100vh - 60px)', background: palette.cream, display: 'flex', flexDirection: 'column' }}>
      {/* Bandeau d'atelier (téléphone) — masqué au-dessus de 768px, où la barre
          du haut (DashboardHeader, T12) porte déjà le nom + le sélecteur. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-raised)] px-5 py-3.5 md:hidden">
        <div className="relative flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileSwitcherOpen((v) => !v)}
            className="flex min-w-0 items-center gap-2 outline-none"
          >
            <span className="truncate text-[11px] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase">
              {workshopName}
            </span>
            <span className="flex size-[22px] flex-none items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-page)] text-[var(--ink-muted)]">
              <ChevronDown size={12} strokeWidth={2.25} />
            </span>
          </button>
          <WorkshopSwitcher open={mobileSwitcherOpen} onClose={() => setMobileSwitcherOpen(false)} currentWorkshopId={workshopId} />
        </div>
        <WorkshopActionsMenu workshopId={workshopId} size={30} />
      </div>

      {/* Aucun chrome au-dessus du contenu (T43) : la maquette ne répète ni le
          nom de l'atelier ni ses actions ici — le nom vit dans la barre du haut
          (T12) et dans le bandeau téléphone ci-dessus, les actions dans le menu
          de l'engrenage (WorkshopActionsMenu). */}

      {/* Tab content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'programme' && (
          <ProgrammeTab
            chapters={chapters}
            workshopId={workshopId}
            workshopName={workshopName}
            canManage={canManage}
            progress={progress}
          />
        )}
        {canManage && activeTab === 'examen' && <ExamenTab workshopId={workshopId} />}
        {canManage && activeTab === 'cours' && <CoursTab />}
      </div>

    </div>
  );
}
