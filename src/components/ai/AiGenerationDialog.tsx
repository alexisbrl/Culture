'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, FileText, AlertTriangle, Check } from 'lucide-react';

import Modal from '@/components/Modal';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { ink, palette, radius } from '@/lib/theme';
import { getWorkshopFiles } from '@/app/actions/workshopFiles';
import {
  ingestChapterNotions,
  ingestChapterQuestions,
  prepareWorkshopIngestion,
  startWorkshopIngestion,
  type PlanIssue,
} from '@/app/actions/aiIngest';

// Le dialogue de génération par IA — **un seul composant pour tous les points
// d'entrée** (Ressources, Chapitre & Notion, et les deux listes de questions).
// Ce qui change d'un bouton à l'autre, ce sont les cases cochées au départ, pas
// le dialogue (§8 du plan d'ingestion).
//
// ─── C'est ICI que vit l'enchaînement des passes ─────────────────────────────
//
// Chaque server action ne fait qu'UN appel au modèle (§5.4) : c'est donc le
// client qui boucle. Deux conséquences visibles :
//   • la progression est réelle, pas simulée — on sait exactement où on en est ;
//   • un onglet fermé interrompt l'ingestion. Ce qui a déjà été écrit reste, et
//     reste annulable ; c'est le prix assumé de l'approche, à revoir le jour où
//     une vraie tâche de fond existera.
//
// **L'ordre des boucles n'est pas décoratif** : toutes les notions, PUIS toutes
// les questions. Le cache de prompt est propre à chaque schéma de sortie, donc
// alterner chapitre par chapitre le ferait manquer à chaque fois — sur douze
// chapitres, ~3 $ contre ~11 $ (mesuré, §5.2).

/** Ce que l'API accepte aujourd'hui (§6). Les autres formats restent visibles
 *  mais non sélectionnables : mieux vaut le dire à la sélection qu'échouer au
 *  milieu d'une génération. */
function isSupported(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('text/');
}

export type DialogFile = { id: string; name: string; mimeType: string; size: number };

/** Le dialogue va chercher lui-même la liste des documents. Chaque écran qui
 *  l'ouvre n'a donc rien à lui fournir d'autre que l'atelier — et les Paramètres
 *  → Chapitre & Notion, qui ne connaissent pas les fichiers, l'ouvrent aussi
 *  simplement que les Ressources. */
export function useWorkshopFiles(workshopId: string): DialogFile[] | null {
  const [files, setFiles] = useState<DialogFile[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getWorkshopFiles(workshopId)
      .then((rows) => { if (!cancelled) setFiles(rows.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }))); })
      .catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [workshopId]);
  return files;
}

type Phase =
  | { step: 'select' }
  // ⚠️ TEMPORAIRE — phase de test : les deux étapes ci-dessous (préparation et
  // confirmation du coût) partent d'un bloc avec `src/lib/ingest/cost.ts`.
  | { step: 'preparing' }
  | { step: 'confirm'; importId: string; corpusTokens: number | null; estimatedUsd: number | null }
  | { step: 'running'; label: string; done: number; total: number }
  | { step: 'done' }
  | { step: 'error'; message: string };

type Props = {
  workshopId: string;
  files: DialogFile[];
  /** Contexte imposé quand on entre par une liste de questions ; `null` quand on
   *  entre par les Paramètres, où l'utilisateur choisit. */
  forcedContext?: 'parcours' | 'exam' | null;
  onClose: () => void;
  onDone?: () => void;
};

export default function AiGenerationDialog({ workshopId, files, forcedContext = null, onClose, onDone }: Props) {
  const t = useTranslations('ai');

  const usable = files.filter((f) => isSupported(f.mimeType));
  const [selected, setSelected] = useState<string[]>(usable.map((f) => f.id));
  const [withNotions, setWithNotions] = useState(true);
  const [withQuestions, setWithQuestions] = useState(true);
  const [phase, setPhase] = useState<Phase>({ step: 'select' });
  const [counts, setCounts] = useState({ chapters: 0, notions: 0, questions: 0 });
  const [issues, setIssues] = useState<{ discarded: PlanIssue[]; adjusted: PlanIssue[] }>({ discarded: [], adjusted: [] });

  // Le téléversement en cours n'est pas interruptible proprement : on ferme la
  // sortie tant qu'il dure, comme pendant la génération.
  const running = phase.step === 'running' || phase.step === 'preparing';
  const context = forcedContext ?? 'parcours';

  function toggleFile(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  /** ⚠️ TEMPORAIRE — phase de test. Téléverse et mesure, puis attend un clic.
   *  Le téléversement est gratuit ; le premier appel au modèle, non — c'est
   *  pour ça que l'estimation peut se faire ici sans rien dépenser. */
  async function prepare() {
    setPhase({ step: 'preparing' });
    const prepared = await prepareWorkshopIngestion(workshopId, selected, {
      notions: withNotions,
      questions: withQuestions,
      context,
    });
    if (!prepared.ok) return setPhase({ step: 'error', message: prepared.error });
    setPhase({
      step: 'confirm',
      importId: prepared.importId,
      corpusTokens: prepared.corpusTokens,
      estimatedUsd: prepared.estimatedUsd,
    });
  }

  async function generate(importId: string) {
    const discarded: PlanIssue[] = [];
    const adjusted: PlanIssue[] = [];
    const tally = { chapters: 0, notions: 0, questions: 0 };

    // Une seule passe si on ne demande que les chapitres ; sinon 1 + N (+ N).
    const totalSteps = 1 + (withNotions ? 1 : 0) + (withQuestions ? 1 : 0);
    setPhase({ step: 'running', label: t('progress.chapters'), done: 0, total: totalSteps });

    const start = await startWorkshopIngestion(workshopId, importId);
    if (!start.ok) return setPhase({ step: 'error', message: start.error });

    discarded.push(...start.discarded);
    adjusted.push(...start.adjusted);
    tally.chapters = start.chapters.length;
    setCounts({ ...tally });

    // ⚠️ Grouper par passe, jamais par chapitre — voir l'en-tête du fichier.
    if (withNotions) {
      for (const [i, chapter] of start.chapters.entries()) {
        setPhase({ step: 'running', label: t('progress.notions', { chapter: chapter.name, i: i + 1, n: start.chapters.length }), done: 1, total: totalSteps });
        const result = await ingestChapterNotions(workshopId, importId, chapter, start.chapters.length);
        if (!result.ok) return setPhase({ step: 'error', message: result.error });
        discarded.push(...result.discarded);
        adjusted.push(...result.adjusted);
        tally.notions += result.written;
        setCounts({ ...tally });
      }
    }

    if (withQuestions) {
      for (const [i, chapter] of start.chapters.entries()) {
        // Un appel par LOT de notions, pas par chapitre (§16.2) : le nombre de
        // lots n'est connu qu'à la réponse du premier, d'où la boucle ouverte.
        let batchIndex = 0;
        let batches = 1;
        while (batchIndex < batches) {
          setPhase({ step: 'running', label: t('progress.questions', { chapter: chapter.name, i: i + 1, n: start.chapters.length }), done: 2, total: totalSteps });
          const result = await ingestChapterQuestions(workshopId, importId, chapter, context, batchIndex);
          if (!result.ok) return setPhase({ step: 'error', message: result.error });
          batches = result.batches;
          discarded.push(...result.discarded);
          adjusted.push(...result.adjusted);
          tally.questions += result.written;
          setCounts({ ...tally });
          batchIndex += 1;
        }
      }
    }

    setIssues({ discarded, adjusted });
    setPhase({ step: 'done' });
    onDone?.();
  }

  return (
    <Modal onClose={running ? undefined : onClose} width={520} portal>
      <div style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={18} color={palette.green} />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: palette.ink, margin: 0 }}>{t('title')}</h2>
        </div>
        <p style={{ fontSize: 13, color: palette.inkSoft, margin: '0 0 18px' }}>{t('subtitle')}</p>

        {phase.step === 'select' && (
          <>
            <SectionLabel>{t('files')}</SectionLabel>
            {files.length === 0 && <Hint>{t('noFiles')}</Hint>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {files.map((file) => {
                const supported = isSupported(file.mimeType);
                const row = (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: supported ? 1 : 0.45 }}>
                    <Checkbox
                      checked={selected.includes(file.id)}
                      disabled={!supported}
                      onChange={() => toggleFile(file.id)}
                      label={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: palette.inkMuted }}>
                          <FileText size={14} color={palette.inkFaint} />
                          {file.name}
                        </span>
                      }
                    />
                  </div>
                );
                // Un format non pris en charge se dit à la sélection, pas au
                // milieu d'une génération.
                return supported ? row : (
                  <Tooltip key={file.id} content={t('unsupported')}>
                    <span>{row}</span>
                  </Tooltip>
                );
              })}
            </div>

            <SectionLabel>{t('whatToGenerate')}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              <Checkbox checked disabled label={<Label>{t('scope.chapters')}</Label>} />
              <Checkbox checked={withNotions} onChange={() => setWithNotions((v) => !v)} label={<Label>{t('scope.notions')}</Label>} />
              <Checkbox
                checked={withQuestions}
                disabled={!withNotions}
                onChange={() => setWithQuestions((v) => !v)}
                label={<Label>{t(forcedContext === 'exam' ? 'scope.questionsExam' : 'scope.questionsParcours')}</Label>}
              />
              {/* Les questions naissent des notions : sans elles, il n'y aurait
                  rien à quoi les rattacher, et aucune ne serait jamais tirée. */}
              {!withNotions && <Hint>{t('questionsNeedNotions')}</Hint>}
            </div>

            <Actions>
              <Ghost onClick={onClose}>{t('cancel')}</Ghost>
              <Primary onClick={prepare} disabled={selected.length === 0}>
                {t('generate')}
              </Primary>
            </Actions>
          </>
        )}

        {/* ⚠️ TEMPORAIRE — phase de test : les deux blocs qui suivent partent
            d'un bloc avec `src/lib/ingest/cost.ts`. */}
        {phase.step === 'preparing' && (
          <div style={{ padding: '4px 0 8px' }}>
            <ProgressBar value={0} max={1} label={t('estimate.preparing')} />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 14 }}>{t('estimate.preparingHint')}</p>
          </div>
        )}

        {phase.step === 'confirm' && (
          <div>
            <SectionLabel>{t('estimate.heading')}</SectionLabel>
            <div style={{ padding: '10px 12px', borderRadius: radius.md, background: ink(0.03), marginBottom: 10 }}>
              <p style={{ fontSize: 13.5, color: palette.ink, margin: 0 }}>
                {phase.corpusTokens === null
                  ? t('estimate.unknownSize')
                  : t('estimate.size', { tokens: Math.round(phase.corpusTokens / 1000) })}
              </p>
              <p style={{ fontSize: 15, fontWeight: 600, color: palette.ink, margin: '6px 0 0' }}>
                {phase.estimatedUsd === null
                  ? t('estimate.unknownCost')
                  : t('estimate.cost', { usd: phase.estimatedUsd.toFixed(2) })}
              </p>
            </div>
            <Hint>{t('estimate.disclaimer')}</Hint>
            <Actions>
              <Ghost onClick={onClose}>{t('cancel')}</Ghost>
              <Primary onClick={() => generate(phase.importId)}>{t('estimate.confirm')}</Primary>
            </Actions>
          </div>
        )}

        {phase.step === 'running' && (
          <div style={{ padding: '4px 0 8px' }}>
            <ProgressBar value={phase.done} max={phase.total} label={phase.label} />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 14 }}>{t('keepOpen')}</p>
            <p style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 6 }}>
              {t('runningCounts', { chapters: counts.chapters, notions: counts.notions, questions: counts.questions })}
            </p>
          </div>
        )}

        {phase.step === 'done' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Check size={17} color={palette.green} />
              <strong style={{ fontSize: 14.5, color: palette.ink }}>
                {t('doneCounts', { chapters: counts.chapters, notions: counts.notions, questions: counts.questions })}
              </strong>
            </div>
            <IssueList heading={t('discarded')} issues={issues.discarded} tone="warn" />
            <IssueList heading={t('adjusted')} issues={issues.adjusted} tone="soft" />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 12 }}>{t('cancellable')}</p>
            <Actions>
              <Primary onClick={onClose}>{t('close')}</Primary>
            </Actions>
          </div>
        )}

        {phase.step === 'error' && (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={17} color={palette.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13.5, color: palette.inkMuted, margin: 0 }}>{phase.message}</p>
            </div>
            <Actions>
              <Ghost onClick={() => setPhase({ step: 'select' })}>{t('retry')}</Ghost>
              <Primary onClick={onClose}>{t('close')}</Primary>
            </Actions>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: palette.inkFaint, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 13.5, color: palette.inkMuted }}>{children}</span>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12.5, color: palette.inkFaint, margin: '2px 0 0' }}>{children}</p>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>{children}</div>;
}

function Ghost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ padding: '8px 14px', borderRadius: radius.md, border: `1px solid ${ink(0.12)}`, background: 'transparent', fontSize: 13.5, color: palette.inkMuted, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px', borderRadius: radius.md, border: 'none',
        background: disabled ? ink(0.12) : palette.green,
        color: disabled ? palette.inkFaint : palette.parchment,
        fontSize: 13.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** Les écarts sont montrés, jamais tus : une correction silencieuse serait pire
 *  que le problème qu'elle règle (§7 du plan). */
function IssueList({ heading, issues, tone }: { heading: string; issues: PlanIssue[]; tone: 'warn' | 'soft' }) {
  if (issues.length === 0) return null;
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: radius.md, background: tone === 'warn' ? 'rgba(156,124,77,.08)' : ink(0.03) }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: tone === 'warn' ? palette.amber : palette.inkSoft, marginBottom: 4 }}>
        {heading} ({issues.length})
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: palette.inkSoft }}>
        {issues.slice(0, 6).map((issue, i) => (
          <li key={i}>{issue.reason}</li>
        ))}
      </ul>
    </div>
  );
}
