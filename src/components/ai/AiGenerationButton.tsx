'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Info, Sparkles, Square, TriangleAlert, X } from 'lucide-react';

import ConfirmDialog from '@/components/ConfirmDialog';
import { Tooltip } from '@/components/ui/tooltip';
import { PIPELINE_ERRORS } from '@/lib/ingest/pipeline';

import type { GenerationOrigin } from '@/lib/ingest/journal';

import AiGenerationDialog, { useWorkshopFiles } from './AiGenerationDialog';
import {
  cancelGeneration,
  capacityOf,
  dismissGeneration,
  displayPhase,
  useGenerations,
  type GenerationDoor,
  type GenerationItem,
  type GenerationProblem,
} from './generationStore';

// Le bouton « générer par IA » des Paramètres, et les encadrés d'avancement des
// listes de questions.
//
// Les Paramètres ont **deux portes sur la même fonction** — Ressources et
// Chapitre & Notion — et c'est voulu : on arrive à la génération soit par les
// documents, soit par le programme qu'ils alimentent. Le dialogue derrière est
// le même (§8 du plan d'ingestion).
//
// ─── Le bouton EST l'avancement (25/09/2026) ─────────────────────────────────
//
// Le dialogue se ferme dès le lancement. Le bouton des Paramètres montre alors
// la génération QU'IL a lancée — et seulement elle : en attente tant qu'une
// autre tourne, puis rempli de vert au fil des étapes, avec le pourcentage. Les
// deux portes n'en font qu'une : lancer depuis Ressources fait basculer le
// bouton de Chapitre & Notion au même instant.
//
// Une liste de questions, elle, peut lancer plusieurs générations à la suite
// (le chapitre 1, puis le 2…) : chacune y a son encadré, en tête de liste.
//
// Au plus trois générations actives par atelier, en cours et en attente
// confondues : au-delà, tout bouton de génération s'éteint et dit pourquoi au
// survol.

type Props = {
  workshopId: string;
  /** Laquelle des portes est celle-ci. Ne change rien au comportement : c'est le
   *  journal de bord qui la relira (@/lib/ingest/journal). */
  origin: GenerationOrigin;
  /** Rendu compact, pour se glisser dans une barre d'outils déjà chargée. */
  compact?: boolean;
};

/** La génération que montre une porte : la plus récente qui s'y rattache et
 *  n'a pas encore disparu. */
function itemOf(items: GenerationItem[], door: GenerationDoor): GenerationItem | null {
  return [...items].reverse().find((i) => i.door === door) ?? null;
}

export default function AiGenerationButton({ workshopId, origin, compact = false }: Props) {
  const t = useTranslations('ai');
  const [open, setOpen] = useState(false);
  // `open` en second argument : la liste est relue à chaque ouverture, donc un
  // document téléversé (ou supprimé) juste avant est pris en compte sans avoir à
  // recharger la page.
  const files = useWorkshopFiles(workshopId, open);
  const state = useGenerations(workshopId);
  const item = itemOf(state.items, 'settings');
  const { full } = capacityOf(state);
  // Une alerte n'occupe pas le bouton : on peut relancer à côté d'elle.
  const busy = item !== null && item.phase !== 'problem';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {busy
        ? <GenerationBar item={item} phase={displayPhase(state, item)} compact={compact} />
        : (
          <IdleButton
            compact={compact}
            disabled={full}
            disabledReason={t('queue.full')}
            onClick={() => setOpen(true)}
          />
        )}
      {item && <GenerationCompanions workshopId={workshopId} item={item} phase={displayPhase(state, item)} />}

      {open && !busy && !full && (
        <AiGenerationDialog
          workshopId={workshopId}
          files={files ?? []}
          origin={origin}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/** Les générations lancées depuis une liste de questions, une par encadré, en
 *  tête de liste. Rien quand il n'y en a pas. */
export function AiGenerationQueue({ workshopId, door }: { workshopId: string; door: Exclude<GenerationDoor, 'settings'> }) {
  const state = useGenerations(workshopId);
  const items = state.items.filter((i) => i.door === door);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <GenerationCard key={item.id} workshopId={workshopId} item={item} phase={displayPhase(state, item)} />
      ))}
    </>
  );
}

function GenerationCard({ workshopId, item, phase }: { workshopId: string; item: GenerationItem; phase: GenerationItem['phase'] }) {
  const t = useTranslations('ai');
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-[var(--green-strong)]" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]">{item.hint || t('queue.untitled')}</span>
        <GenerationCompanions workshopId={workshopId} item={item} phase={phase} />
      </div>
      {phase === 'problem' && item.problem
        ? <div className="text-[12.5px] text-[var(--ink-muted)]"><ProblemText problem={item.problem} /></div>
        : <GenerationBar item={item} phase={phase} compact wide />}
    </div>
  );
}

function IdleButton({ compact, disabled, disabledReason, onClick }: {
  compact: boolean;
  disabled: boolean;
  disabledReason: string;
  onClick: () => void;
}) {
  const t = useTranslations('ai');
  const iconSize = compact ? 14 : 16;
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative inline-flex items-center gap-2 whitespace-nowrap rounded-[12px]',
        'border border-[var(--line-strong)] bg-[var(--surface-input)] font-medium',
        'transition-[background] duration-150 ease-[var(--ease-out)]',
        'enabled:hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:text-[var(--ink-faint)]',
        compact ? 'h-8 px-3 text-[13px]' : 'h-[38px] px-3.5 text-[14px]',
        'cursor-pointer text-[var(--ink)]',
      ].join(' ')}
    >
      <Sparkles size={iconSize} strokeWidth={1.75} className={disabled ? '' : 'text-[var(--green-strong)]'} />
      <span>{t('button')}</span>
    </button>
  );
  // Un bouton désactivé n'émet aucun événement de souris : l'infobulle se pose
  // sur un conteneur (docs/architecture.md).
  return disabled ? <Tooltip content={disabledReason}><span className="inline-flex">{button}</span></Tooltip> : button;
}

/** La barre d'une génération : en attente (vide, avec son explication), en cours
 *  (remplie au fil de l'avancement), terminée (une coche). */
function GenerationBar({ item, phase, compact, wide = false }: {
  item: GenerationItem;
  phase: GenerationItem['phase'];
  compact: boolean;
  wide?: boolean;
}) {
  const t = useTranslations('ai');
  const fill = phase === 'done' ? 100 : phase === 'running' ? Math.max(0, Math.min(100, item.progress)) : 0;
  const iconSize = compact ? 14 : 16;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fill}
      aria-busy={phase === 'running'}
      aria-live="polite"
      className={[
        'relative inline-flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-[12px]',
        'border border-[var(--line-strong)] bg-[var(--surface-input)] font-medium',
        compact ? 'h-8 px-3 text-[13px]' : 'h-[38px] px-3.5 text-[14px]',
        wide ? 'w-full' : '',
        phase === 'running'
          ? 'cursor-progress text-[var(--green-strong)]'
          : phase === 'done'
            ? 'cursor-default text-[var(--success-strong)]'
            : 'cursor-default text-[var(--ink-muted)]',
      ].join(' ')}
    >
      {/* Le remplissage passe SOUS le texte : c'est la barre de progression. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-[var(--green-tint)] transition-[width] duration-200 ease-[var(--ease-out)]"
        style={{ width: `${fill}%` }}
      />
      {phase === 'queued' && (
        <>
          <span className="relative">{t('queue.waiting')}</span>
          <Tooltip content={t('queue.waitingInfo')} delay={120}>
            <span role="img" aria-label={t('queue.waitingInfo')} className="relative inline-flex text-[var(--ink-faint)]">
              <Info size={13} strokeWidth={2} />
            </span>
          </Tooltip>
        </>
      )}
      {phase === 'running' && (
        <>
          <span className="relative">{t('running')}</span>
          <span className={['relative min-w-[40px] text-right font-semibold tabular-nums', wide ? 'ml-auto' : ''].join(' ')}>{`${Math.round(fill)} %`}</span>
        </>
      )}
      {phase === 'done' && (
        <>
          <Check size={iconSize} strokeWidth={2} className="relative" />
          <span className="relative">{t('finished')}</span>
        </>
      )}
    </div>
  );
}

/** Ce qu'on peut faire d'une génération : l'arrêter quand elle tourne (avec
 *  confirmation — il défait ce qui a été écrit), la retirer de la file quand
 *  elle attend (sans confirmation — elle n'a rien écrit), ou lire son alerte
 *  quand elle a mal fini. */
function GenerationCompanions({ workshopId, item, phase }: { workshopId: string; item: GenerationItem; phase: GenerationItem['phase'] }) {
  const t = useTranslations('ai');
  const [askStop, setAskStop] = useState(false);
  const saved = !item.id.startsWith('local:');

  return (
    <>
      {/* L'arrêt n'apparaît qu'une fois le lot ouvert par le serveur : avant, il
          n'y a rien à arrêter — et rien à défaire. */}
      {phase === 'running' && item.importId && (
        <Tooltip content={t('stop.aria')}>
          <button
            type="button"
            onClick={() => setAskStop(true)}
            aria-label={t('stop.aria')}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-input)] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <Square size={12} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      {phase === 'queued' && saved && !item.importId && (
        <Tooltip content={t('queue.cancel')}>
          <button
            type="button"
            onClick={() => { void cancelGeneration(workshopId, item.id); }}
            aria-label={t('queue.cancel')}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-input)] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      {phase === 'problem' && item.problem && (
        <Tooltip content={<ProblemText problem={item.problem} />}>
          <button
            type="button"
            onClick={() => dismissGeneration(workshopId, item.id)}
            aria-label={t('problem.dismiss')}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-[var(--tan)]"
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
            void cancelGeneration(workshopId, item.id);
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
  if (problem.kind === 'full') return <>{t('queue.full')}</>;
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
