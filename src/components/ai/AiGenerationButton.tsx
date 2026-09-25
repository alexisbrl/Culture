'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Sparkles, Square, TriangleAlert } from 'lucide-react';

import ConfirmDialog from '@/components/ConfirmDialog';
import { Tooltip } from '@/components/ui/tooltip';
import { PIPELINE_ERRORS } from '@/lib/ingest/pipeline';

import type { GenerationOrigin } from '@/lib/ingest/journal';

import AiGenerationDialog, { useWorkshopFiles } from './AiGenerationDialog';
import { dismissGenerationProblem, stopGeneration, useGeneration, type GenerationProblem } from './generationStore';

// Le bouton « générer par IA », prêt à poser sur n'importe quel écran.
//
// Les Paramètres ont **deux portes sur la même fonction** — Ressources et
// Chapitre & Notion — et c'est voulu : on arrive à la génération soit par les
// documents, soit par le programme qu'ils alimentent. Le dialogue derrière est
// le même (§8 du plan d'ingestion).
//
// ─── Le bouton EST l'avancement (25/09/2026) ─────────────────────────────────
//
// Le dialogue se ferme dès le lancement. Pendant la génération, le bouton se
// remplit de vert au fil des étapes et affiche le pourcentage, sans être
// cliquable : on ne lance pas une seconde génération sur la même. Une coche le
// temps d'un souffle quand elle réussit, puis il redevient lui-même. L'état est
// partagé par tout l'onglet (`generationStore`) : lancer depuis Ressources fait
// basculer le bouton de Chapitre & Notion au même instant.
//
// À côté, deux compagnons discrets : l'arrêt pendant qu'elle tourne (avec
// confirmation — il défait ce qui a été écrit), et une alerte quand elle a
// échoué ou n'a pas tout écrit. Rien quand tout s'est bien passé : les éléments
// apparaissent, c'est le compte-rendu.

type Props = {
  workshopId: string;
  /** Contexte imposé quand on entre par une liste de questions. Depuis les
   *  Paramètres, il n'y en a pas : l'utilisateur choisit dans le dialogue. */
  forcedContext?: 'parcours' | 'exam' | null;
  /** Laquelle des portes est celle-ci. Ne change rien au comportement : c'est le
   *  journal de bord qui la relira (@/lib/ingest/journal). */
  origin: GenerationOrigin;
  /** Rendu compact, pour se glisser dans une barre d'outils déjà chargée. */
  compact?: boolean;
};

export default function AiGenerationButton({ workshopId, forcedContext = null, origin, compact = false }: Props) {
  const t = useTranslations('ai');
  const [open, setOpen] = useState(false);
  // `open` en second argument : la liste est relue à chaque ouverture, donc un
  // document téléversé (ou supprimé) juste avant est pris en compte sans avoir à
  // recharger la page.
  const files = useWorkshopFiles(workshopId, open);
  const { running, done } = useGeneration(workshopId);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <GenerationButtonFace
        workshopId={workshopId}
        compact={compact}
        onClick={() => setOpen(true)}
        idleLabel={t('button')}
      />
      <GenerationCompanions workshopId={workshopId} />

      {open && !running && !done && (
        <AiGenerationDialog
          workshopId={workshopId}
          files={files ?? []}
          forcedContext={forcedContext}
          origin={origin}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/** L'avancement seul, pour les écrans où la génération ne part pas d'un
 *  bouton à part (les listes de questions, où elle se lance depuis « nouvelle
 *  question »). Rien du tout quand aucune génération ne tourne. */
export function AiGenerationStatus({ workshopId, style }: { workshopId: string; style?: React.CSSProperties }) {
  const { running, done, problem } = useGeneration(workshopId);
  if (!running && !done && !problem) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, ...style }}>
      {(running || done) && <GenerationButtonFace workshopId={workshopId} compact />}
      <GenerationCompanions workshopId={workshopId} />
    </div>
  );
}

/** Le bouton lui-même, dans ses trois états : prêt, en cours (rempli au fil de
 *  l'avancement), terminé. */
function GenerationButtonFace({ workshopId, compact, onClick, idleLabel }: {
  workshopId: string;
  compact: boolean;
  onClick?: () => void;
  idleLabel?: string;
}) {
  const t = useTranslations('ai');
  const { running, done, progress } = useGeneration(workshopId);
  const status = running ? 'running' : done ? 'done' : 'idle';
  const fill = status === 'done' ? 100 : status === 'running' ? Math.max(0, Math.min(100, progress)) : 0;
  const iconSize = compact ? 14 : 16;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status !== 'idle'}
      aria-busy={status === 'running'}
      aria-live="polite"
      className={[
        'relative inline-flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-[12px]',
        'border border-[var(--line-strong)] bg-[var(--surface-input)] font-medium',
        'transition-[background] duration-150 ease-[var(--ease-out)]',
        'enabled:hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none',
        compact ? 'h-8 px-3 text-[13px]' : 'h-[38px] px-3.5 text-[14px]',
        status === 'running'
          ? 'cursor-progress text-[var(--green-strong)]'
          : status === 'done'
            ? 'cursor-default text-[var(--success-strong)]'
            : 'cursor-pointer text-[var(--ink)]',
      ].join(' ')}
    >
      {/* Le remplissage passe SOUS le texte : c'est la barre de progression. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-[var(--green-tint)] transition-[width] duration-200 ease-[var(--ease-out)]"
        style={{ width: `${fill}%` }}
      />
      {status === 'idle' && (
        <>
          <Sparkles size={iconSize} strokeWidth={1.75} className="relative text-[var(--green-strong)]" />
          <span className="relative">{idleLabel ?? t('button')}</span>
        </>
      )}
      {status === 'running' && (
        <>
          <span className="relative">{t('running')}</span>
          <span className="relative min-w-[40px] text-right font-semibold tabular-nums">{`${Math.round(fill)} %`}</span>
        </>
      )}
      {status === 'done' && (
        <>
          <Check size={iconSize} strokeWidth={2} className="relative" />
          <span className="relative">{t('finished')}</span>
        </>
      )}
    </button>
  );
}

/** L'arrêt (pendant la génération) et l'alerte (après un problème). */
function GenerationCompanions({ workshopId }: { workshopId: string }) {
  const t = useTranslations('ai');
  const { running, importId, problem } = useGeneration(workshopId);
  const [askStop, setAskStop] = useState(false);

  return (
    <>
      {/* L'arrêt n'apparaît qu'une fois le lot ouvert par le serveur : avant, il
          n'y a rien à arrêter — et rien à défaire. */}
      {running && importId && (
        <Tooltip content={t('stop.aria')}>
          <button
            type="button"
            onClick={() => setAskStop(true)}
            aria-label={t('stop.aria')}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-input)] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <Square size={12} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      {!running && problem && (
        <Tooltip content={<ProblemText problem={problem} />}>
          <button
            type="button"
            onClick={() => dismissGenerationProblem(workshopId)}
            aria-label={t('problem.dismiss')}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] text-[var(--tan)]"
          >
            <TriangleAlert size={16} strokeWidth={1.9} />
          </button>
        </Tooltip>
      )}

      {/* Arrêter défait ce qui a été écrit : c'est la seule commande
          destructrice de la génération, elle se confirme. */}
      {askStop && (
        <ConfirmDialog
          portal
          title={t('stop.title')}
          description={t('stop.body')}
          confirmLabel={t('stop.confirm')}
          cancelLabel={t('stop.keep')}
          onCancel={() => setAskStop(false)}
          onConfirm={() => {
            setAskStop(false);
            void stopGeneration(workshopId);
          }}
        />
      )}
    </>
  );
}

/** Ce qui s'est mal passé, en toutes lettres : les cas connus ont leur phrase,
 *  les autres gardent le message de l'étape. */
function ProblemText({ problem }: { problem: GenerationProblem }) {
  const t = useTranslations('ai');
  if (problem.kind === 'busy') return <>{t('busy')}</>;
  if (problem.kind === 'failed') {
    const text = (() => {
      switch (problem.error) {
        case PIPELINE_ERRORS.writtenNotRead: return t('writtenNotRead');
        case PIPELINE_ERRORS.nothingWritten: return t('nothingWritten');
        case PIPELINE_ERRORS.cancelledForgotten: return t('cancelledForgotten');
        case PIPELINE_ERRORS.timeout: return t('timeout');
        default: return problem.error ? t('problem.failed', { reason: problem.error }) : t('stopped');
      }
    })();
    return <>{text}</>;
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {problem.missing > 0 && <span>{t('partialQuestions', { count: problem.missing })}</span>}
      {problem.discarded.length > 0 && (
        <span>
          {t('problem.discarded', { count: problem.discarded.length })}
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {problem.discarded.slice(0, 6).map((issue, i) => <li key={i}>{issue.reason}</li>)}
          </ul>
        </span>
      )}
    </span>
  );
}
