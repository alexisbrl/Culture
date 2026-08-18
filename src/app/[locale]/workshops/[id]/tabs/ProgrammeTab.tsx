'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ListChecks, Play, ArrowRight, RotateCcw, Sprout } from 'lucide-react';
import type { Chapter } from '@/app/actions/workshopChapters';
import type { ParcoursProgress } from '@/app/actions/parcoursProgress';
// ⚠️ TEMPORAIRE — voir le commentaire du bouton de remise à zéro.
import { resetMyParcoursProgress } from '@/app/actions/parcoursProgress';
import ParcoursQuestions from './programme/ParcoursQuestions';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import LinkButton from '@/components/LinkButton';

type Props = {
  chapters: Chapter[];
  workshopId: string;
  workshopName: string;
  canManage: boolean;
  progress: ParcoursProgress;
};

/**
 * Vue « chapitres » de la maquette (vueChapitres, lignes 490-526) : un bloc
 * héros au milieu + la liste de TOUS les chapitres en bas.
 *
 * Le bloc héros n'est qu'un **raccourci** vers le chapitre en cours (le premier
 * par `position`) : il ne porte pas de barre de progression, sinon la même
 * information s'afficherait deux fois. Le chapitre en cours n'est pas retiré de
 * la liste du bas — c'est là qu'on lit l'avancement de chaque chapitre.
 *
 * Les barres de progression sont celles du membre connecté, calculées sur le
 * score de maîtrise de ses notions (voir src/lib/workshops/mastery.ts). Un
 * chapitre sans notion reliée à ses questions reste à 0 % : c'est la donnée
 * réelle, pas un état de chargement.
 */
export default function ProgrammeTab({ chapters, workshopId, workshopName, canManage, progress }: Props) {
  const t = useTranslations('programme');
  const locale = useLocale();
  const router = useRouter();
  const [showQuestions, setShowQuestions] = useState(false);

  // ⚠️ TEMPORAIRE — voir le commentaire du bouton plus bas.
  const [resetting, setResetting] = useState(false);
  async function handleReset() {
    setResetting(true);
    await resetMyParcoursProgress(workshopId);
    setResetting(false);
    // Les barres viennent du rendu serveur : sans rafraîchissement, elles
    // resteraient à leur ancienne valeur jusqu'à la prochaine navigation.
    router.refresh();
  }

  if (showQuestions) {
    return <ParcoursQuestions workshopId={workshopId} chapters={chapters} onBack={() => setShowQuestions(false)} />;
  }

  const sorted = [...chapters].sort((a, b) => a.position - b.position);
  const hero = sorted[0];

  return (
    <div className="relative flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] px-6 py-7">
        {/* Le bouton sort de la colonne de 560px pour aller se coller en haut à
            droite de la zone (comme la maquette) : à l'intérieur, il mordait
            sur les titres d'atelier longs. Trois états faute de place :
            en flux et sans libellé sur téléphone (la colonne occupe toute la
            largeur), absolu et sans libellé à partir de md (la marge de la
            colonne n'accueille que la pastille), libellé complet à partir de xl
            (~360px de marge, le bouton en fait ~275). */}
        <div className="text-[22px] font-bold text-[var(--ink)]">{workshopName}</div>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={progress.workshopPercent} className="flex-1" />
          <span className="text-[13px] font-bold text-[var(--green-strong)] tabular-nums">
            {t('progressPercent', { pct: progress.workshopPercent })}
          </span>
        </div>
        {/* `aria-label` : le libellé du bouton disparaît sous `xl`, l'icône
            reste seule — le nom accessible ne peut donc pas en dépendre. */}
        {canManage && (
          <Tooltip content={t('questions.open')}>
          <button
            type="button"
            onClick={() => setShowQuestions(true)}
            aria-label={t('questions.open')}
            className="mt-3.5 ml-auto flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] px-[13px] py-2 text-[13px] font-semibold text-[var(--green-strong)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--green-light)] hover:bg-[var(--green-tint)] md:absolute md:top-6 md:right-6 md:z-[5] md:mt-0 xl:px-[15px]"
          >
            <ListChecks size={15} strokeWidth={1.75} />
            <span className="hidden xl:inline">{t('questions.open')}</span>
          </button>
          </Tooltip>
        )}

        {/* ⚠️ MÉCANISME DE TEST TEMPORAIRE — à retirer avant la mise en service.
            Remet à zéro la progression du membre connecté sur CET atelier, pour
            rejouer les mêmes questions pendant la mise au point du parcours.
            Volontairement discret et d'un seul tenant (bouton + handler + clé
            i18n `resetProgress`), pour se supprimer sans laisser de trace.
            Voir `resetUserMastery` dans @/lib/workshops/mastery. */}
        {/* Le `span` porte l'infobulle : pendant la remise à zéro le bouton est
            désactivé, et un bouton désactivé n'émet aucun événement de souris. */}
        <Tooltip content={t('resetProgressHint')}>
        <span className="mt-3 inline-flex">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--ink-faint)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
        >
          <RotateCcw size={12} strokeWidth={1.75} />
          {resetting ? t('resetProgressBusy') : t('resetProgress')}
        </button>
        </span>
        </Tooltip>

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

            <div className="my-6 flex items-center gap-3.5">
              <span className="h-px flex-1 bg-[var(--line)]" />
              <span className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
                {t('allChaptersEyebrow')}
              </span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <div className="flex flex-col gap-2.5">
              {sorted.map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`/${locale}/workshops/${workshopId}/exercise/${chapter.id}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-[18px] py-3.5 shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--ink)]">{chapter.name}</span>
                    <ProgressBar value={progress.chapterPercent[chapter.id] ?? 0} size="sm" className="mt-2.5" />
                  </div>
                  <span className="flex size-[34px] flex-none items-center justify-center rounded-full bg-[var(--green-tint)] text-[var(--green-strong)]">
                    <Play size={14} strokeWidth={1.75} fill="currentColor" />
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
