'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { ListChecks, Play, ArrowRight, Sprout } from 'lucide-react';
import type { Chapter } from '@/app/actions/workshopChapters';
import ParcoursQuestions from './programme/ParcoursQuestions';
import { EmptyState } from '@/components/ui/empty-state';
import LinkButton from '@/components/LinkButton';

type Props = {
  chapters: Chapter[];
  workshopId: string;
  workshopName: string;
  canManage: boolean;
};

/**
 * Vue « chapitres » de la maquette (vueChapitres, lignes 490-526) : chapitre
 * en cours en héros + liste des autres. Aucune barre de progression (ni ici,
 * ni dans l'en-tête, ni « verrouillé ») : `brick_mastery` n'est alimentée par
 * rien encore (voir src/lib/workshops/notions.ts) — donnée inexistante,
 * masquée plutôt qu'inventée. Le chapitre héros est le premier par `position`.
 */
export default function ProgrammeTab({ chapters, workshopId, workshopName, canManage }: Props) {
  const t = useTranslations('programme');
  const locale = useLocale();
  const [showQuestions, setShowQuestions] = useState(false);

  if (showQuestions) {
    return <ParcoursQuestions workshopId={workshopId} chapters={chapters} onBack={() => setShowQuestions(false)} />;
  }

  const sorted = [...chapters].sort((a, b) => a.position - b.position);
  const [hero, ...rest] = sorted;

  return (
    <div className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-6 py-7">
      <div className="relative">
        <div className="text-[22px] font-bold text-[var(--ink)]">{workshopName}</div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowQuestions(true)}
            title={t('questions.open')}
            className="absolute top-0 right-0 inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] px-[15px] py-2 text-[13px] font-semibold text-[var(--green-strong)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--green-light)] hover:bg-[var(--green-tint)]"
          >
            <ListChecks size={15} strokeWidth={1.75} />
            {t('questions.open')}
          </button>
        )}
      </div>

      {!hero ? (
        <EmptyState icon={Sprout} title={t('emptyTitle')} description={t('emptyDesc')} className="mt-8" />
      ) : (
        <>
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-[22px] flex size-[132px] items-center justify-center rounded-full bg-[var(--green-tint)]">
              <Sprout size={52} strokeWidth={1.5} className="text-[var(--green)]" />
            </div>
            <div className="text-xs font-bold tracking-[0.12em] text-[var(--ink-muted)] uppercase">
              {t('currentChapterEyebrow')}
            </div>
            <div className="mt-2 text-[21px] font-bold text-[var(--ink)]">{hero.name}</div>
            <LinkButton href={`/${locale}/workshops/${workshopId}/exercise/${hero.id}`} size="lg" className="mt-[22px]">
              {t('startExercise')}
              <ArrowRight size={18} strokeWidth={1.75} />
            </LinkButton>
          </div>

          {rest.length > 0 && (
            <>
              <div className="my-6 flex items-center gap-3.5">
                <span className="h-px flex-1 bg-[var(--line)]" />
                <span className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
                  {t('allChaptersEyebrow')}
                </span>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <div className="flex flex-col gap-2.5">
                {rest.map((chapter) => (
                  <Link
                    key={chapter.id}
                    href={`/${locale}/workshops/${workshopId}/exercise/${chapter.id}`}
                    className="flex items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-[18px] py-3.5 shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
                  >
                    <span className="min-w-0 flex-1 text-sm font-bold text-[var(--ink)]">{chapter.name}</span>
                    <span className="flex size-[34px] flex-none items-center justify-center rounded-full bg-[var(--green-tint)] text-[var(--green-strong)]">
                      <Play size={14} strokeWidth={1.75} fill="currentColor" />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
