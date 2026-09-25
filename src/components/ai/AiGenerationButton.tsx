'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Info, Pencil, Sparkles, TriangleAlert, X } from 'lucide-react';

import ConfirmDialog from '@/components/ConfirmDialog';
import { Tooltip } from '@/components/ui/tooltip';
import { PIPELINE_ERRORS } from '@/lib/ingest/pipeline';
import { palette } from '@/lib/theme';

import type { GenerationOrigin } from '@/lib/ingest/journal';

import AiGenerationDialog, { useWorkshopFiles } from './AiGenerationDialog';
import {
  cancelGeneration,
  capacityOf,
  dismissGeneration,
  displayPhase,
  holdGeneration,
  releaseGeneration,
  useGenerations,
  type GenerationDoor,
  type GenerationItem,
  type GenerationProblem,
} from './generationStore';
import {
  closeSettingsBox,
  openSettingsBox,
  setSettingsBoxPrompt,
  useSettingsBox,
  type GenerationEditing,
  type SettingsBox,
} from './settingsBoxStore';

export type { GenerationEditing };

// Le bouton « générer par IA » des Paramètres, l'encadré où l'on écrit sa
// consigne, et les encadrés d'avancement des listes de questions.
//
// Les Paramètres ont **deux portes sur la même fonction** — Ressources et
// Chapitre & Notion — et c'est voulu : on arrive à la génération soit par les
// documents, soit par le programme qu'ils alimentent.
//
// ─── Un encadré, jamais une fenêtre (25/09/2026) ─────────────────────────────
//
// Cliquer « générer par IA » ouvre un ENCADRÉ en place, fait comme l'encadré de
// création de la banque d'examen, qui naît du bouton et le remplace. Dans les
// Paramètres, c'est le MÊME encadré dans Ressources et dans Chapitre & Notion,
// posé au-dessus du titre : on passe d'un onglet à l'autre sans perdre ni lui,
// ni sa consigne (./settingsBoxStore). Modifier une génération en attente
// rouvre ce même encadré, là où elle se trouve.
//
// ─── Le bouton EST l'avancement ──────────────────────────────────────────────
//
// L'encadré se ferme dès le lancement. Le bouton des Paramètres montre alors la
// génération QU'IL a lancée — et seulement elle : en attente tant qu'une autre
// tourne, puis rempli de vert au fil des étapes, avec le pourcentage. Les deux
// portes n'en font qu'une : lancer depuis Ressources fait basculer le bouton de
// Chapitre & Notion au même instant.
//
// Une liste de questions, elle, peut lancer plusieurs générations à la suite
// (le chapitre 1, puis le 2…) : chacune y a son encadré, en tête de liste.
//
// Au plus trois générations actives par atelier, en cours et en attente
// confondues : au-delà, tout bouton de génération s'éteint et dit pourquoi au
// survol.

/** La hauteur de la zone de dépôt des Ressources, et donc celle de l'encadré de
 *  génération des Paramètres (25/09/2026, demandé par Alexis : « exactement la
 *  même taille »). Posée sur les deux plutôt que mesurée : dans Chapitre &
 *  Notion, la zone de dépôt n'est pas à l'écran. L'encadré grandit au-delà avec
 *  le texte saisi. */
export const GENERATION_BOX_MIN_HEIGHT = 160;

type Props = {
  workshopId: string;
  /** Rendu compact, pour se glisser dans une barre d'outils déjà chargée. */
  compact?: boolean;
};

/** La génération que montre une porte : la plus récente qui s'y rattache et
 *  n'a pas encore disparu. */
function itemOf(items: GenerationItem[], door: GenerationDoor): GenerationItem | null {
  return [...items].reverse().find((i) => i.door === door) ?? null;
}

/** Une génération qui attend encore son tour, et que le serveur a enregistrée :
 *  on peut en modifier la consigne. */
const editable = (item: GenerationItem, phase: GenerationItem['phase']) =>
  phase === 'queued' && !item.importId && !item.id.startsWith('local:');

export default function AiGenerationButton({ workshopId, compact = false }: Props) {
  const t = useTranslations('ai');
  const state = useGenerations(workshopId);
  const box = useSettingsBox(workshopId);
  const onOpen = (editing?: GenerationEditing) => openSettingsBox(workshopId, editing);
  const item = itemOf(state.items, 'settings');
  const phase = item ? displayPhase(state, item) : null;
  const { full } = capacityOf(state);
  // Une alerte n'occupe pas le bouton : on peut relancer à côté d'elle.
  const busy = item !== null && item.phase !== 'problem';

  // L'encadré ouvert a pris sa place : il en est né.
  if (box) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {busy && phase
        ? (
          <GenerationBar
            item={item}
            phase={phase}
            compact={compact}
            // En attente, le bouton rouvre sa consigne pour la modifier.
            onEdit={editable(item, phase) ? () => onOpen({ requestId: item.id, prompt: item.hint }) : undefined}
          />
        )
        : (
          <IdleButton
            compact={compact}
            disabled={full}
            disabledReason={t('queue.full')}
            onClick={() => onOpen()}
          />
        )}
      {item && phase && <GenerationCompanions workshopId={workshopId} item={item} phase={phase} />}
    </span>
  );
}

/** L'encadré de génération : sa ligne de titre, puis la consigne et ses deux
 *  boutons — le même contenu que l'ancienne fenêtre, sans la fenêtre.
 *
 *  Rouvert sur une génération en attente (`editing`), il la met à l'écart de
 *  la file le temps de la modification : la file la saute, elle garde sa place.
 *  Abandonner la remet dans la file ; enregistrer la met à jour. Si la
 *  modification traîne au point que la génération quitte la file, la consigne
 *  reste là, et l'enregistrer la redemande (@/lib/ingest/queue). */
export function AiGenerationBox({ workshopId, origin, forcedContext = null, editing, onClose, titleSlot, hint, onHintChange, minHeight, grow = false }: {
  workshopId: string;
  origin: GenerationOrigin;
  forcedContext?: 'parcours' | 'exam' | null;
  editing?: GenerationEditing;
  onClose: () => void;
  /** Hauteur plancher — celle de la zone de dépôt, dans les Paramètres. */
  minHeight?: number;
  /** Se déploie depuis le bouton qui l'ouvre, qu'il remplace. */
  grow?: boolean;
  /** Ce qui se pose à droite de la ligne de titre (la bascule manuel / IA de
   *  la banque d'examen). */
  titleSlot?: React.ReactNode;
  hint?: string;
  onHintChange?: (hint: string) => void;
}) {
  const t = useTranslations('ai');
  // Une liste de questions ne relit pas les documents : inutile de les charger.
  const files = useWorkshopFiles(workshopId, editing?.requestId, forcedContext !== null);
  const requestId = editing?.requestId;

  // La mise à l'écart, à l'ouverture. Partie entre-temps, la génération n'a
  // plus rien à modifier : l'encadré se referme.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    void holdGeneration(workshopId, requestId).then((held) => { if (!held && !cancelled) closeRef.current(); });
    return () => { cancelled = true; };
  }, [workshopId, requestId]);

  return (
    <div
      className={grow ? 'ai-box-grow' : undefined}
      // ⚠️ Les deux onglets des Paramètres montent le même encadré, et l'un est
      // masqué : une animation ne court pas sous un `display: none`, elle
      // attend — et se jouerait au premier retour sur l'onglet. L'encadré né
      // masqué renonce donc à la sienne.
      ref={grow ? (el) => { if (el && el.offsetParent === null) el.classList.remove('ai-box-grow'); } : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', minHeight, borderRadius: 14, background: palette.surfaceRaised, border: `1px solid ${palette.line}` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 24 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: palette.green }}>
          {(editing ? t('box.editTitle') : t('box.newTitle')).toUpperCase()}
        </div>
        {titleSlot}
      </div>
      <AiGenerationDialog
        workshopId={workshopId}
        files={files ?? []}
        forcedContext={forcedContext}
        origin={origin}
        frame="inline"
        editing={editing}
        hint={hint}
        onHintChange={onHintChange}
        onClose={onClose}
        onCancel={() => {
          if (requestId) void releaseGeneration(workshopId, requestId);
          onClose();
        }}
      />
    </div>
  );
}

/** L'encadré de génération des Paramètres, commun à Ressources et à Chapitre &
 *  Notion, posé au-dessus du titre. Rien quand il est fermé. */
export function SettingsGenerationBox({ workshopId, origin }: { workshopId: string; origin: GenerationOrigin }) {
  const box = useSettingsBox(workshopId);
  if (!box) return null;
  return <SettingsBoxBody key={box.openedAt} workshopId={workshopId} origin={origin} box={box} />;
}

function SettingsBoxBody({ workshopId, origin, box }: { workshopId: string; origin: GenerationOrigin; box: SettingsBox }) {
  // Déployé seulement s'il vient d'être ouvert : l'onglet masqué, lui, le
  // trouve déjà ouvert en revenant, et ne le redéploie pas.
  const [grow] = useState(() => Date.now() - box.openedAt < 400);
  return (
    <div style={{ marginBottom: 16 }}>
      <AiGenerationBox
        key={box.editing?.requestId ?? 'new'}
        workshopId={workshopId}
        origin={origin}
        editing={box.editing}
        hint={box.prompt}
        onHintChange={(prompt) => setSettingsBoxPrompt(workshopId, prompt)}
        onClose={() => closeSettingsBox(workshopId)}
        minHeight={GENERATION_BOX_MIN_HEIGHT}
        grow={grow}
      />
    </div>
  );
}

/** Les générations lancées depuis une liste de questions, une par encadré, en
 *  tête de liste. Rien quand il n'y en a pas.
 *
 *  Modifier une génération en attente rouvre l'encadré de génération À SA
 *  PLACE, comme on rouvre une question pour la modifier. */
export function AiGenerationQueue({ workshopId, door }: { workshopId: string; door: Exclude<GenerationDoor, 'settings'> }) {
  const state = useGenerations(workshopId);
  const items = state.items.filter((i) => i.door === door);
  // La modification en cours. Gardée à part de la génération elle-même : si
  // celle-ci quitte la file pendant qu'on écrit, l'encadré et sa consigne restent.
  const [editing, setEditing] = useState<GenerationEditing | null>(null);
  const [draft, setDraft] = useState('');
  const origin: GenerationOrigin = door === 'exam' ? 'questions-exam' : 'questions-parcours';
  const box = editing && (
    <AiGenerationBox
      key={editing.requestId}
      workshopId={workshopId}
      origin={origin}
      forcedContext={door}
      editing={editing}
      hint={draft}
      onHintChange={setDraft}
      onClose={() => setEditing(null)}
    />
  );
  const shown = items.some((i) => i.id === editing?.requestId);
  if (items.length === 0 && !box) return null;
  return (
    <>
      {!shown && box}
      {items.map((item) => {
        if (item.id === editing?.requestId) return <div key={item.id}>{box}</div>;
        const phase = displayPhase(state, item);
        return (
          <GenerationCard
            key={item.id}
            workshopId={workshopId}
            item={item}
            phase={phase}
            onEdit={editable(item, phase) ? () => { setDraft(item.hint); setEditing({ requestId: item.id, prompt: item.hint }); } : undefined}
          />
        );
      })}
    </>
  );
}

/** L'encadré d'une génération lancée depuis une liste : sa consigne, et sa barre
 *  — remplacée par l'alerte quand elle a mal fini. En attente, un clic rouvre
 *  sa consigne pour la modifier. */
function GenerationCard({ workshopId, item, phase, onEdit }: {
  workshopId: string;
  item: GenerationItem;
  phase: GenerationItem['phase'];
  onEdit?: () => void;
}) {
  const t = useTranslations('ai');
  const label = <span className="min-w-0 flex-1 truncate text-left text-[13px] text-[var(--ink)]">{item.hint || t('queue.untitled')}</span>;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-[var(--green-strong)]" />
        {/* La consigne se lit ici ; elle se modifie depuis la ligne « en
            attente », en dessous — une seule porte, pas deux. */}
        {label}
        <GenerationCompanions workshopId={workshopId} item={item} phase={phase} inCard />
      </div>
      {phase === 'problem' && item.problem
        ? <ProblemRow workshopId={workshopId} problem={item.problem} />
        : <GenerationBar item={item} phase={phase} compact wide onEdit={onEdit} />}
    </div>
  );
}

/** L'alerte, à la place de la barre. Sur un atelier vide, elle mène aux
 *  Ressources des Paramètres, où l'on dépose de quoi construire le programme. */
function ProblemRow({ workshopId, problem }: { workshopId: string; problem: GenerationProblem }) {
  const t = useTranslations('ai');
  const locale = useLocale();
  return (
    <div className="flex items-start gap-2 text-[12.5px] text-[var(--ink-muted)]">
      <TriangleAlert size={16} strokeWidth={1.9} className="mt-px shrink-0 text-[var(--tan)]" />
      <div className="flex min-w-0 flex-col gap-1">
        <ProblemText problem={problem} />
        {problem.kind === 'empty' && (
          <Link
            href={`/${locale}/workshops/${workshopId}/settings?section=files`}
            className="font-medium text-[var(--green-strong)] underline underline-offset-2"
          >
            {t('queue.emptyLink')}
          </Link>
        )}
      </div>
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
function GenerationBar({ item, phase, compact, wide = false, onEdit }: {
  item: GenerationItem;
  phase: GenerationItem['phase'];
  compact: boolean;
  wide?: boolean;
  /** En attente, un clic sur la barre rouvre la consigne pour la modifier. */
  onEdit?: () => void;
}) {
  const t = useTranslations('ai');
  const fill = phase === 'done' ? 100 : phase === 'running' ? Math.max(0, Math.min(100, item.progress)) : 0;
  const iconSize = compact ? 14 : 16;
  const clickable = phase === 'queued' && !!onEdit;
  const Shell = clickable ? 'button' : 'div';

  return (
    <Shell
      {...(clickable
        ? { type: 'button' as const, onClick: onEdit, 'aria-label': t('queue.edit') }
        : { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': fill, 'aria-busy': phase === 'running', 'aria-live': 'polite' as const })}
      className={[
        'relative inline-flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-[12px]',
        'border border-[var(--line-strong)] bg-[var(--surface-input)] font-medium',
        compact ? 'h-8 px-3 text-[13px]' : 'h-[38px] px-3.5 text-[14px]',
        wide ? 'w-full' : '',
        phase === 'running'
          ? 'cursor-progress text-[var(--green-strong)]'
          : phase === 'done'
            ? 'cursor-default text-[var(--success-strong)]'
            : clickable
              ? 'cursor-pointer text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]'
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
      {clickable && <Pencil size={12} strokeWidth={1.9} className={['relative text-[var(--ink-faint)]', wide ? 'ml-auto' : ''].join(' ')} />}
    </Shell>
  );
}

/** Ce qu'on peut faire d'une génération, toujours d'une CROIX (25/09/2026,
 *  demandé par Alexis — un carré pour l'arrêt et une croix pour la file
 *  disaient deux fois la même chose) : l'arrêter quand elle tourne — ce qui
 *  défait ce qu'elle a écrit —, la retirer quand elle attend, masquer son
 *  alerte quand elle a mal fini. Les deux premiers se confirment. */
function GenerationCompanions({ workshopId, item, phase, inCard = false }: {
  workshopId: string;
  item: GenerationItem;
  phase: GenerationItem['phase'];
  /** Dans un encadré, l'alerte est déjà écrite à la place de la barre : il ne
   *  reste que la croix pour la masquer. À côté du bouton des Paramètres,
   *  c'est l'icône qui la porte, en infobulle. */
  inCard?: boolean;
}) {
  const t = useTranslations('ai');
  const [ask, setAsk] = useState<'stop' | 'remove' | null>(null);
  const saved = !item.id.startsWith('local:');

  return (
    <>
      {/* L'arrêt n'apparaît qu'une fois le lot ouvert par le serveur : avant, il
          n'y a rien à arrêter — et rien à défaire. */}
      {phase === 'running' && item.importId && (
        <Tooltip content={t('stop.aria')}>
          <button
            type="button"
            onClick={() => setAsk('stop')}
            aria-label={t('stop.aria')}
            className={CROSS}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      {phase === 'queued' && saved && !item.importId && (
        <Tooltip content={t('queue.removeTitle')}>
          <button
            type="button"
            onClick={() => setAsk('remove')}
            aria-label={t('queue.removeTitle')}
            className={CROSS}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      {phase === 'problem' && item.problem && inCard && (
        <Tooltip content={t('problem.dismiss')}>
          <button
            type="button"
            onClick={() => dismissGeneration(workshopId, item.id)}
            aria-label={t('problem.dismiss')}
            className={CROSS}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </Tooltip>
      )}

      {phase === 'problem' && item.problem && !inCard && (
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

      {/* Arrêter défait ce qui a été écrit ; retirer de la file perd une
          consigne qu'on a pris la peine d'écrire. Les deux se confirment. */}
      {ask && (
        <ConfirmDialog
          portal
          title={t(ask === 'stop' ? 'stop.title' : 'queue.removeTitle')}
          description={t(ask === 'stop' ? 'stop.body' : 'queue.removeBody')}
          confirmLabel={t(ask === 'stop' ? 'stop.confirm' : 'queue.removeConfirm')}
          cancelLabel={t(ask === 'stop' ? 'stop.keep' : 'queue.removeKeep')}
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            setAsk(null);
            void cancelGeneration(workshopId, item.id);
          }}
        />
      )}
    </>
  );
}

const CROSS = 'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-input)] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]';

/** Ce qui s'est mal passé, en toutes lettres : les cas connus ont leur phrase,
 *  les autres gardent le message de l'étape. */
function ProblemText({ problem }: { problem: GenerationProblem }) {
  const t = useTranslations('ai');
  if (problem.kind === 'full') return <>{t('queue.full')}</>;
  if (problem.kind === 'empty') return <>{t('queue.empty')}</>;
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
