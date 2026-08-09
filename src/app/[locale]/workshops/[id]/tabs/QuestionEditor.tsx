'use client';

import { palette, ink, withAlpha } from '@/lib/theme';

import { useState } from 'react';
import { useTranslations } from 'next-intl';


// ─── Types ────────────────────────────────────────────────────────────────
//
// Définitions déplacées vers @/lib/workshops/examTypes (audit §5.3) : ce sont
// des types de domaine (persistés en base, consommés par les server actions),
// pas des types d'UI. Ré-exportés ici pour ne pas casser les nombreux imports
// existants (`from './QuestionEditor'`) dans le reste de l'onglet examen.
import type { QuestionType, ResponseType, QuestionPart, Question, BloomLevel } from '@/lib/workshops/examTypes';
import { BLOOM_LEVELS, DEFAULT_BLOOM_LEVEL } from '@/lib/workshops/examTypes';
export type { QuestionType, ResponseType, QuestionPart, Question, BloomLevel };

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  textuel: 'Textuel',
  visuel: 'Visuel',
  audio: 'Audio',
};

// Ces constantes et les briques de formulaire plus bas sont partagées avec
// l'éditeur en ligne de la feuille d'examen (`examen/InlineQuestionEditor`) :
// une seule définition des types, des règles et du rendu des champs.
//
// `qcs` est volontairement absent de l'ordre du menu : c'est la variante
// « réponse unique » de `qcm`, basculée par une pilule (voir `ResponseType`).
export const RESPONSE_TYPE_ORDER: ResponseType[] = [
  'qcm', 'textuelle', 'liste', 'tableau', 'matching', 'dessin', 'fichier', 'audio', 'sans_reponse',
];

export const CHOICE_BASED: ResponseType[] = ['qcs', 'qcm', 'matching'];

// Types disponibles en V2 uniquement — affichés mais désactivés (badge V2)
export const QUESTION_TYPE_V2: QuestionType[] = ['visuel', 'audio'];
// Plus aucun type n'est différé : les neuf entrées du menu ont toutes leur bloc
// d'édition et leur espace de réponse sur la copie (09/08/2026). La constante
// reste pour ne pas casser ses consommateurs et pour un futur type différé.
export const RESPONSE_TYPE_V2: ResponseType[] = [];

export function emptyPart(): QuestionPart {
  return { content: '', responseType: 'sans_reponse', answer: '', choices: [], correctChoices: [], shuffleChoices: false, textLines: 4, answerOptional: false, difficulty: { enabled: false, value: 3 }, duration: { enabled: false, minutes: 2, seconds: 0 } };
}

export function emptyQuestion(): Question {
  return {
    id: 'q' + Date.now(),
    title: '',
    questionType: 'textuel',
    responseType: 'textuelle',
    content: '',
    answer: '',
    choices: [],
    correctChoices: [],
    shuffleChoices: false,
    pools: [],
    answerOptional: false,
    difficulty: { enabled: false, value: 3 },
    duration: { enabled: false, minutes: 2, seconds: 0 },
    parts: [],
    examIds: [],
    textLines: 4,
    // Le niveau de Bloom est obligatoire : toute nouvelle question naît au
    // niveau 1, et l'UI ne permet pas de le dé-sélectionner.
    bloomLevel: DEFAULT_BLOOM_LEVEL,
    notionIds: [],
  };
}

// ─── Small building blocks (cohérents avec le design system du projet) ─────

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: palette.inkFaint }}>{children}</div>
      {hint && <div style={{ fontSize: 11.5, color: palette.inkFaint, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; soon?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => !o.soon && onChange(o.value)}
            disabled={o.soon}
            style={{
              fontSize: 12.5,
              padding: '7px 13px',
              borderRadius: 999,
              cursor: o.soon ? 'default' : 'pointer',
              fontFamily: 'inherit',
              border: o.soon ? `1px solid ${ink(0.08)}` : active ? `1px solid ${ink(0.30)}` : `1px solid ${ink(0.10)}`,
              background: o.soon ? ink(0.05) : active ? palette.ink : withAlpha(palette.paper, 0.7),
              color: o.soon ? palette.inkFaint : active ? palette.parchment : palette.inkMuted,
              fontWeight: active ? 500 : 400,
              transition: 'all 0.12s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function MiniSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none',
        background: value ? palette.greenSoft : ink(0.14),
        cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start', transition: 'all 0.18s',
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: palette.paper, display: 'block', boxShadow: `0 1px 3px ${ink(0.18)}` }} />
    </button>
  );
}

export function TextField({ value, onChange, placeholder, multiline, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number }) {
  const style: React.CSSProperties = {
    width: '100%', fontSize: 13, color: palette.ink, border: `1px solid ${ink(0.12)}`,
    borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' as const,
  };
  if (multiline) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={style} />;
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={style} />;
}

export function DifficultyDurationFields({
  difficulty,
  duration,
  onDifficultyChange,
  onDurationChange,
}: {
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number; seconds: number };
  onDifficultyChange: (v: { enabled: boolean; value: number }) => void;
  onDurationChange: (v: { enabled: boolean; minutes: number; seconds: number }) => void;
}) {
  const t = useTranslations('examen');
  return (
    <>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <FieldLabel hint={t('editor.difficultyHint')}>{t('editor.difficulty')}</FieldLabel>
        <MiniSwitch value={difficulty.enabled} onChange={(v) => onDifficultyChange({ ...difficulty, enabled: v })} />
      </div>
      {difficulty.enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -4 }}>
          <input type="range" min={1} max={5} value={difficulty.value} onChange={(e) => onDifficultyChange({ ...difficulty, value: Number(e.target.value) })} style={{ flex: 1, accentColor: palette.amber }} />
          <span style={{ fontSize: 12.5, color: palette.ink, fontVariantNumeric: 'tabular-nums', width: 32, textAlign: 'right' as const }}>{difficulty.value}/5</span>
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <FieldLabel hint={t('editor.durationHint')}>{t('editor.duration')}</FieldLabel>
        <MiniSwitch value={duration.enabled} onChange={(v) => onDurationChange({ ...duration, enabled: v })} />
      </div>
      {duration.enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -4 }}>
          <div style={{ width: 90 }}>
            <input type="number" min={0} value={duration.minutes} onChange={(e) => onDurationChange({ ...duration, minutes: Math.max(0, Number(e.target.value) || 0) })} style={{ width: '100%', fontSize: 13, color: palette.ink, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <span style={{ fontSize: 12.5, color: palette.inkSoft }}>{t('editor.minutes')}</span>
          <div style={{ width: 90 }}>
            <input type="number" min={0} max={59} value={duration.seconds} onChange={(e) => onDurationChange({ ...duration, seconds: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })} style={{ width: '100%', fontSize: 13, color: palette.ink, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <span style={{ fontSize: 12.5, color: palette.inkSoft }}>{t('editor.seconds')}</span>
        </div>
      )}
    </>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 14px' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: palette.ink, whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ flex: 1, height: 1, background: ink(0.08) }} />
    </div>
  );
}

// ─── Choice list editor (QCM, variante « réponse unique » comprise, et matching) ─
//
// `hideAddButton` : l'éditeur en ligne de la feuille d'examen place son propre
// « + ajouter une réponse » sur la même rangée que les pilules de réglage
// (maquette, l.1113-1119). Le popup du Parcours garde le bouton intégré.
//
// Pas de réordonnancement des réponses (09/08/2026) : la poignée de glisser-
// déposer a été retirée. L'ordre d'affichage sur la copie relève de « ordre
// aléatoire », pas d'un classement fixé à la main dans l'éditeur.
export function ChoiceListEditor({
  responseType,
  choices,
  correctChoices,
  onChange,
  hideAddButton = false,
}: {
  responseType: ResponseType;
  choices: string[];
  correctChoices: number[];
  onChange: (choices: string[], correctChoices: number[]) => void;
  hideAddButton?: boolean;
}) {
  const t = useTranslations('examen');

  function updateChoice(i: number, value: string) {
    const next = [...choices];
    next[i] = value;
    onChange(next, correctChoices);
  }

  function addChoice() {
    onChange([...choices, ''], correctChoices);
  }

  function removeChoice(i: number) {
    const next = choices.filter((_, idx) => idx !== i);
    const nextCorrect = correctChoices.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
    onChange(next, nextCorrect);
  }

  function toggleCorrect(i: number) {
    if (responseType === 'qcs') {
      onChange(choices, correctChoices.includes(i) ? [] : [i]);
    } else if (responseType === 'qcm') {
      const has = correctChoices.includes(i);
      onChange(choices, has ? correctChoices.filter((c) => c !== i) : [...correctChoices, i]);
    }
  }

  const showPairs = responseType === 'matching';
  const showCorrectMarker = responseType === 'qcs' || responseType === 'qcm';

  return (
    <div>
      {choices.length === 0 && (
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: palette.amber, padding: '4px 0 10px' }}>
          {t('choices.prompt', { what: showPairs ? t('choices.promptPairs') : t('choices.promptOptions') })}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {choices.map((c, i) => (
          <div key={i} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showCorrectMarker && (
              /* Exactement la case du type « tableau » : 22px, pastille pleine
                 par ombre interne, ronde quand une seule réponse est permise. */
              <button
                onClick={() => toggleCorrect(i)}
                title={responseType === 'qcs' ? t('choices.correctUnique') : t('choices.correct')}
                style={{
                  width: 22, height: 22, flexShrink: 0, boxSizing: 'border-box' as const,
                  borderRadius: responseType === 'qcs' ? 999 : 6, cursor: 'pointer', padding: 0,
                  border: correctChoices.includes(i) ? 'none' : `1.5px solid ${palette.lineStrong}`,
                  boxShadow: correctChoices.includes(i) ? `inset 0 0 0 7px ${palette.green}` : 'none',
                  background: palette.surfaceRaised,
                }}
              />
            )}
            {showPairs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <TextField value={c.split(' :: ')[0] ?? ''} onChange={(v) => updateChoice(i, `${v} :: ${c.split(' :: ')[1] ?? ''}`)} placeholder={t('choices.pairLeft', { n: i + 1 })} />
                <span style={{ fontSize: 12, color: palette.inkFaint }}>→</span>
                <TextField value={c.split(' :: ')[1] ?? ''} onChange={(v) => updateChoice(i, `${c.split(' :: ')[0] ?? ''} :: ${v}`)} placeholder={t('choices.pairRight')} />
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <TextField value={c} onChange={(v) => updateChoice(i, v)} placeholder={t('choices.option', { n: i + 1 })} />
              </div>
            )}
            <button onClick={() => removeChoice(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: palette.danger, fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
          </div>
          </div>
        ))}
      </div>
      {!hideAddButton && (
        <button onClick={addChoice} style={{ marginTop: 10, fontSize: 12, padding: '7px 12px', borderRadius: 8, border: `1px dashed ${ink(0.20)}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>
          {showPairs ? t('choices.addPair') : t('choices.addOption')}
        </button>
      )}
    </div>
  );
}

// ─── Question editor panel ───────────────────────────────────────────────

export default function QuestionEditor({
  question,
  allQuestions,
  pools,
  notions,
  onCreatePool,
  onSave,
  onCancel,
}: {
  question: Question;
  allQuestions: Question[];
  pools: { id: string; name: string; color: string }[];
  notions: { id: string; title: string }[];
  onCreatePool: (name: string) => string;
  onSave: (q: Question) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('examen');
  // Filet pour les questions créées avant l'ajout du champ : une question sans
  // niveau ne doit jamais exister côté éditeur non plus.
  const [draft, setDraft] = useState<Question>({
    ...question,
    bloomLevel: question.bloomLevel ?? DEFAULT_BLOOM_LEVEL,
    notionIds: question.notionIds ?? [],
  });
  const [newPoolName, setNewPoolName] = useState('');
  const [creatingPool, setCreatingPool] = useState(false);

  const isNew = !allQuestions.some((q) => q.id === question.id);
  const canSave = draft.content.trim().length > 0;
  const isChoiceBased = CHOICE_BASED.includes(draft.responseType);
  const hasAnswerField = draft.responseType !== 'sans_reponse' && !isChoiceBased;

  function patch(p: Partial<Question>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function toggleNotion(id: string) {
    patch({ notionIds: draft.notionIds.includes(id) ? draft.notionIds.filter((n) => n !== id) : [...draft.notionIds, id] });
  }

  function togglePool(id: string) {
    patch({ pools: draft.pools.includes(id) ? draft.pools.filter((p) => p !== id) : [...draft.pools, id] });
  }

  function addPool() {
    const name = newPoolName.trim();
    if (!name) return;
    const id = onCreatePool(name);
    patch({ pools: [...draft.pools, id] });
    setNewPoolName('');
    setCreatingPool(false);
  }

  function patchPart(idx: number, p: Partial<QuestionPart>) {
    const parts = draft.parts.map((pt, i) => i === idx ? { ...pt, ...p } : pt);
    patch({ parts });
  }

  function removePart(idx: number) {
    patch({ parts: draft.parts.filter((_, i) => i !== idx) });
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* backdrop */}
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />

      {/* panel */}
      <div style={{ position: 'relative', width: 640, maxWidth: '100%', maxHeight: '100%', borderRadius: 18, background: palette.cream, boxShadow: `0 24px 64px ${ink(0.24)}`, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${ink(0.08)}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: palette.ink }}>{isNew ? t('editor.new') : t('editor.edit')}</div>
            <div style={{ fontSize: 12, color: palette.inkSoft }}>{t('editor.subtitle')}</div>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.paper, 0.7), color: palette.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontFamily: 'inherit' }}>×</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 24px' }}>
          {/* titre */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel hint={t('editor.titleHint')}>{t('editor.titleLabel')}</FieldLabel>
            <TextField value={draft.title} onChange={(v) => patch({ title: v })} placeholder={t('editor.titlePlaceholder')} />
          </div>

          {/* type de question */}
          <FieldLabel hint={t('editor.qTypeHint')}>{t('editor.qTypeLabel')}</FieldLabel>
          <Segmented value={draft.questionType} onChange={(v) => patch({ questionType: v })} options={(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((k) => ({ value: k, label: t(`questionType.${k}`), soon: QUESTION_TYPE_V2.includes(k) }))} />

          {draft.questionType === 'visuel' && (
            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, border: `1px dashed ${ink(0.18)}`, background: withAlpha(palette.paper, 0.6), fontSize: 12, color: palette.inkSoft }}>
              <div style={{ marginBottom: 6 }}>{t('editor.visualAttach')}</div>
              <button disabled style={{ fontSize: 11.5, padding: '6px 11px', borderRadius: 7, border: `1px solid ${ink(0.10)}`, background: ink(0.04), color: palette.inkFaint, cursor: 'not-allowed', fontFamily: 'inherit' }}>
                {t('editor.visualEdit')}
              </button>
            </div>
          )}
          {draft.questionType === 'audio' && (
            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, border: `1px dashed ${ink(0.18)}`, background: withAlpha(palette.paper, 0.6), fontSize: 12, color: palette.inkSoft }}>
              {t('editor.audioComing')}
            </div>
          )}

          {/* contenu */}
          <div style={{ marginTop: 18 }}>
            <FieldLabel>{t('editor.contentLabel')}</FieldLabel>
            <TextField value={draft.content} onChange={(v) => patch({ content: v })} placeholder={t('editor.contentPlaceholder')} multiline rows={4} />
          </div>

          {/* type de réponse */}
          <div style={{ marginTop: 18 }}>
            <FieldLabel hint={t('editor.rTypeHint')}>{t('editor.rTypeLabel')}</FieldLabel>
            <Segmented
              value={draft.responseType}
              onChange={(v) => patch({ responseType: v, choices: CHOICE_BASED.includes(v) ? (draft.choices.length ? draft.choices : ['', '']) : draft.choices, correctChoices: [] })}
              options={RESPONSE_TYPE_ORDER.map((k) => ({ value: k, label: t(`responseType.${k}`), soon: RESPONSE_TYPE_V2.includes(k) }))}
            />
          </div>

          {/* réponse / choix selon le type */}
          {isChoiceBased && (
            <div style={{ marginTop: 14 }}>
              <FieldLabel hint={
                draft.responseType === 'qcs' ? t('editor.hintQcs') :
                draft.responseType === 'matching' ? t('editor.hintMatching') :
                t('editor.hintQcm')
              }>
                {draft.responseType === 'matching' ? t('editor.choicesPairs') : t('editor.choicesOptions')}
              </FieldLabel>
              <ChoiceListEditor
                responseType={draft.responseType}
                choices={draft.choices}
                correctChoices={draft.correctChoices}
                onChange={(choices, correctChoices) => patch({ choices, correctChoices })}
              />
              {(draft.responseType === 'qcs' || draft.responseType === 'qcm') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                  <FieldLabel hint={t('editor.shuffleHint')}>{t('editor.shuffleLabel')}</FieldLabel>
                  <MiniSwitch value={draft.shuffleChoices} onChange={(v) => patch({ shuffleChoices: v })} />
                </div>
              )}
            </div>
          )}

          {hasAnswerField && (
            <div style={{ marginTop: draft.questionType === 'visuel' || draft.questionType === 'audio' ? 14 : 14 }}>
              {!(draft.responseType === 'textuelle' && draft.answerOptional) && (
                <>
                  <FieldLabel hint={
                    draft.responseType === 'dessin' ? t('editor.answerHintDessin') :
                    draft.responseType === 'audio' ? t('editor.answerHintAudio') :
                    t('editor.answerHintDefault')
                  }>
                    {t('editor.answerLabelDefault')}
                  </FieldLabel>
                  <TextField value={draft.answer} onChange={(v) => patch({ answer: v })} placeholder={t('editor.answerPlaceholder')} multiline rows={3} />
                </>
              )}
              {draft.responseType === 'textuelle' && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FieldLabel hint={t('editor.freeAnswerHint')}>{t('editor.freeAnswerLabel')}</FieldLabel>
                    <MiniSwitch value={draft.answerOptional} onChange={(v) => patch({ answerOptional: v })} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <FieldLabel hint={t('editor.linesHint')}>{t('editor.linesLabel')}</FieldLabel>
                    <input
                      type="number"
                      min={1}
                      value={draft.textLines ?? 4}
                      onChange={(e) => patch({ textLines: Math.max(1, Number(e.target.value) || 1) })}
                      style={{ width: 70, flexShrink: 0, fontSize: 13, color: palette.ink, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {draft.responseType === 'sans_reponse' && (
            <div style={{ marginTop: 14, fontSize: 12, color: palette.inkFaint }}>{t('editor.noAnswerNote')}</div>
          )}

          <DifficultyDurationFields
            difficulty={draft.difficulty}
            duration={draft.duration}
            onDifficultyChange={(difficulty) => patch({ difficulty })}
            onDurationChange={(duration) => patch({ duration })}
          />

          {/* parties supplémentaires */}
          <SectionDivider title={t('editor.partsDivider')} />
          <div style={{ fontSize: 12, color: palette.inkSoft, marginBottom: 10 }}>
            {t('editor.partsIntro')}
          </div>
          {draft.parts.map((part, idx) => {
            const partChoiceBased = CHOICE_BASED.includes(part.responseType);
            const partHasAnswer = part.responseType !== 'sans_reponse' && !partChoiceBased;
            return (
              <div key={idx} style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 12, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.paper, 0.55) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: palette.inkMuted }}>{t('editor.part', { n: idx + 2 })}</span>
                  <button onClick={() => removePart(idx)} style={{ border: 'none', background: 'none', color: palette.danger, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                </div>
                <FieldLabel>{t('editor.partStatement')}</FieldLabel>
                <TextField value={part.content} onChange={(v) => patchPart(idx, { content: v })} placeholder={t('editor.partStatementPlaceholder')} multiline rows={3} />
                <div style={{ marginTop: 12 }}>
                  <FieldLabel>{t('editor.rTypeLabel')}</FieldLabel>
                  <Segmented
                    value={part.responseType}
                    onChange={(v) => patchPart(idx, { responseType: v, choices: CHOICE_BASED.includes(v) ? (part.choices.length ? part.choices : ['', '']) : part.choices, correctChoices: [] })}
                    options={RESPONSE_TYPE_ORDER.map((k) => ({ value: k, label: t(`responseType.${k}`), soon: RESPONSE_TYPE_V2.includes(k) }))}
                  />
                </div>
                {partChoiceBased && (
                  <div style={{ marginTop: 12 }}>
                    <FieldLabel>{part.responseType === 'matching' ? t('editor.choicesPairs') : t('editor.choicesOptions')}</FieldLabel>
                    <ChoiceListEditor responseType={part.responseType} choices={part.choices} correctChoices={part.correctChoices} onChange={(choices, correctChoices) => patchPart(idx, { choices, correctChoices })} />
                    {(part.responseType === 'qcs' || part.responseType === 'qcm') && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                        <FieldLabel hint={t('editor.shuffleHint')}>{t('editor.shuffleLabel')}</FieldLabel>
                        <MiniSwitch value={part.shuffleChoices} onChange={(v) => patchPart(idx, { shuffleChoices: v })} />
                      </div>
                    )}
                  </div>
                )}
                {partHasAnswer && (
                  <div style={{ marginTop: 12 }}>
                    {!(part.responseType === 'textuelle' && part.answerOptional) && (
                      <>
                        <FieldLabel>{t('editor.answerLabelDefault')}</FieldLabel>
                        <TextField value={part.answer} onChange={(v) => patchPart(idx, { answer: v })} placeholder={t('editor.answerPlaceholder')} multiline rows={2} />
                      </>
                    )}
                    {part.responseType === 'textuelle' && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <FieldLabel hint={t('editor.freeAnswerHintShort')}>{t('editor.freeAnswerLabel')}</FieldLabel>
                          <MiniSwitch value={part.answerOptional} onChange={(v) => patchPart(idx, { answerOptional: v })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <FieldLabel hint={t('editor.linesHintShort')}>{t('editor.linesLabel')}</FieldLabel>
                          <input type="number" min={1} value={part.textLines} onChange={(e) => patchPart(idx, { textLines: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 70, flexShrink: 0, fontSize: 13, color: palette.ink, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <DifficultyDurationFields
                  difficulty={part.difficulty}
                  duration={part.duration}
                  onDifficultyChange={(difficulty) => patchPart(idx, { difficulty })}
                  onDurationChange={(duration) => patchPart(idx, { duration })}
                />
              </div>
            );
          })}
          <button
            onClick={() => patch({ parts: [...draft.parts, emptyPart()] })}
            style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: `1px dashed ${ink(0.18)}`, background: 'transparent', color: palette.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}
          >
            {t('editor.addPart')}
          </button>

          {/* options avancées */}
          <SectionDivider title={t('editor.optionsDivider')} />

          {/* niveau de Bloom — obligatoire : Segmented a toujours exactement une
              option active, il n'existe donc pas d'état « aucun niveau » */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel hint={t('editor.bloomHint')}>{t('editor.bloomLabel')}</FieldLabel>
            <Segmented<string>
              value={String(draft.bloomLevel)}
              onChange={(v) => patch({ bloomLevel: Number(v) as BloomLevel })}
              options={BLOOM_LEVELS.map((level) => ({ value: String(level), label: `${level} · ${t(`bloom.${level}`)}` }))}
            />
          </div>

          {/* notions couvertes (toutes celles de l'atelier) */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel hint={t('editor.notionsHint')}>{t('editor.notionsLabel')}</FieldLabel>
            {draft.notionIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {draft.notionIds.map((nid) => {
                  const n = notions.find((nn) => nn.id === nid);
                  if (!n) return null;
                  return (
                    <span key={nid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.green, 0.12), color: palette.ink }}>
                      {n.title}
                      <button onClick={() => toggleNotion(nid)} style={{ border: 'none', background: 'none', color: palette.inkMuted, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {notions.length === 0 ? (
              <div style={{ fontSize: 11.5, color: palette.inkFaint }}>{t('editor.noNotions')}</div>
            ) : (
              <select
                value=""
                onChange={(e) => { if (e.target.value) toggleNotion(e.target.value); }}
                style={{ width: '100%', fontSize: 13, color: palette.inkMuted, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}
              >
                <option value="">{t('editor.addNotionOption')}</option>
                {notions.filter((n) => !draft.notionIds.includes(n.id)).map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* libellés */}
          <div>
            <FieldLabel hint={t('editor.labelsHint')}>{t('editor.labelsLabel')}</FieldLabel>
            {draft.pools.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {draft.pools.map((pid) => {
                  const p = pools.find((pp) => pp.id === pid);
                  if (!p) return null;
                  return (
                    <span key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: `1px solid ${ink(0.10)}`, background: palette.ink, color: palette.parchment }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                      {p.name}
                      <button onClick={() => togglePool(pid)} style={{ border: 'none', background: 'none', color: palette.parchment, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {creatingPool ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <TextField value={newPoolName} onChange={setNewPoolName} placeholder={t('editor.labelNamePlaceholder')} />
                </div>
                <button onClick={addPool} style={{ fontSize: 12, padding: '0 14px', borderRadius: 9, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.paper, 0.7), color: palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit' }}>{t('add')}</button>
                <button onClick={() => { setCreatingPool(false); setNewPoolName(''); }} style={{ fontSize: 12, padding: '0 14px', borderRadius: 9, border: `1px solid ${ink(0.10)}`, background: 'transparent', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>{t('cancelLower')}</button>
              </div>
            ) : (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value === '__new__') setCreatingPool(true);
                  else if (e.target.value) togglePool(e.target.value);
                }}
                style={{ width: '100%', fontSize: 13, color: palette.inkMuted, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}
              >
                <option value="">{t('editor.addLabelOption')}</option>
                {pools.filter((p) => !draft.pools.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__new__">{t('editor.newLabelOption')}</option>
              </select>
            )}
          </div>

        </div>

        {/* footer */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: `1px solid ${ink(0.08)}`, flexShrink: 0, background: palette.cream }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('cancel')}
          </button>
          <button
            disabled={!canSave}
            onClick={() => onSave(draft)}
            style={{ flex: 2, padding: '11px 14px', borderRadius: 10, border: 'none', background: canSave ? palette.ink : ink(0.12), color: canSave ? palette.paper : palette.inkFaint, fontSize: 13, fontWeight: 500, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
          >
            {isNew ? t('editor.addQuestion') : t('editor.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}
