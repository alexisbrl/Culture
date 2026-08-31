'use client';

import { palette, ink, withAlpha } from '@/lib/theme';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AudioLines, ImageIcon } from 'lucide-react';
import { MediaAttachment, useQuestionMediaDrop } from './examen/questionMedia';
import { LabelPill, LabelPicker, SelectMenu } from './examen/examShared';


// ─── Types ────────────────────────────────────────────────────────────────
//
// Définitions déplacées vers @/lib/workshops/examTypes (audit §5.3) : ce sont
// des types de domaine (persistés en base, consommés par les server actions),
// pas des types d'UI. Ré-exportés ici pour ne pas casser les nombreux imports
// existants (`from './QuestionEditor'`) dans le reste de l'onglet examen.
import type { ResponseType, QuestionPart, Question, BloomLevel } from '@/lib/workshops/examTypes';
export type { ResponseType, QuestionPart, Question, BloomLevel };

// Constantes de types de réponse, briques de formulaire et corps d'édition
// d'un énoncé : une seule définition, dans `examen/questionFields`, partagée
// avec l'éditeur en ligne de la feuille d'examen. Ré-exportées ici pour ne pas
// casser d'éventuels imports existants (`from './QuestionEditor'`).
import {
  CHOICE_BASED, RESPONSE_TYPE_ORDER, RESPONSE_TYPE_V2,
  ChoiceListEditor, QuestionFields, TextField, emptyPart,
} from './examen/questionFields';
export {
  CHOICE_BASED, RESPONSE_TYPE_ORDER, RESPONSE_TYPE_V2,
  ChoiceListEditor, TextField, emptyPart,
} from './examen/questionFields';

// Une question neuve s'ouvre en QCM, le type de très loin le plus posé — avec
// les deux propositions vides que produit déjà le menu de type (`selectType`,
// `questionFields`), pour n'avoir plus qu'à les remplir.
export function emptyQuestion(): Question {
  return {
    // Identifiant aléatoire, PAS dérivé de l'horloge. `'q' + Date.now()` tenait
    // tant qu'un humain créait les questions une par une ; l'ingestion IA en
    // crée des dizaines dans la même milliseconde, et elles partageraient alors
    // le même identifiant — l'`upsert` les écraserait les unes les autres, sans
    // la moindre erreur (docs/ai-ingestion-plan.md §12.1). Un uuid ne peut pas
    // non plus être confondu avec un saut de page (`isPageBreakId`, préfixe
    // `pb`) : un uuid commence toujours par un caractère hexadécimal.
    id: crypto.randomUUID(),
    responseType: 'qcm',
    content: '',
    answer: '',
    choices: ['', ''],
    correctChoices: [],
    shuffleChoices: false,
    pools: [],
    answerOptional: false,
    difficulty: { enabled: false, value: 3 },
    duration: { enabled: false, minutes: 2, seconds: 0 },
    parts: [],
    examIds: [],
    textLines: 4,
    notionIds: [],
    notionBloom: {},
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

// ─── Question editor panel ───────────────────────────────────────────────

export default function QuestionEditor({
  workshopId,
  question,
  allQuestions,
  pools,
  notions,
  onCreatePool,
  onSave,
  onCancel,
}: {
  workshopId: string;
  question: Question;
  allQuestions: Question[];
  pools: { id: string; name: string; color: string }[];
  notions: { id: string; title: string }[];
  onCreatePool: (name: string) => string;
  onSave: (q: Question) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('examen');
  const [draft, setDraft] = useState<Question>({
    ...question,
    notionIds: question.notionIds ?? [],
  });
  // Le popup n'a pas l'interrupteur global de l'éditeur en ligne : les réglages
  // secondaires des questions liées (attendus, notions, barème étendu) se
  // révèlent par ce bouton, sous la liste.
  const [partsAdvanced, setPartsAdvanced] = useState(false);

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

  function addPool(name: string) {
    patch({ pools: [...draft.pools, onCreatePool(name)] });
  }

  function patchPart(idx: number, p: Partial<QuestionPart>) {
    const parts = draft.parts.map((pt, i) => i === idx ? { ...pt, ...p } : pt);
    patch({ parts });
  }

  function removePart(idx: number) {
    patch({ parts: draft.parts.filter((_, i) => i !== idx) });
  }

  // Glisser-déposer un fichier n'importe où sur le panneau : reconnu comme
  // image ou audio et rangé au bon endroit (voir examen/questionMedia.tsx).
  const { dragOver, dropError, dropHandlers } = useQuestionMediaDrop(workshopId, (kind, media) => patch({ [kind]: media }));

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* backdrop */}
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />

      {/* panel */}
      <div
        {...dropHandlers}
        style={{
          position: 'relative', width: 640, maxWidth: '100%', maxHeight: '100%', borderRadius: 18,
          background: palette.cream, boxShadow: `0 24px 64px ${ink(0.24)}`, display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-sans)', overflow: 'hidden',
          outline: dragOver ? `2px dashed ${palette.green}` : 'none', outlineOffset: -2,
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${ink(0.08)}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: palette.ink }}>{isNew ? t('editor.new') : t('editor.edit')}</div>
            <div style={{ fontSize: 12, color: palette.inkSoft }}>{t('editor.subtitle')}</div>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.paper, 0.7), color: palette.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontFamily: 'inherit' }}>×</button>
        </div>
        {dropError && <div style={{ padding: '10px 22px 0', fontSize: 12.5, color: palette.danger, flexShrink: 0 }}>{dropError}</div>}

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 24px' }}>
          {/* contenu + pièces jointes */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>{t('editor.contentLabel')}</FieldLabel>
              <TextField value={draft.content} onChange={(v) => patch({ content: v })} placeholder={t('editor.contentPlaceholder')} multiline rows={4} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 22 }}>
              <MediaAttachment
                workshopId={workshopId}
                kind="image"
                media={draft.image}
                onChange={(image) => patch({ image })}
                label={t('inline.attachImage')}
                icon={<ImageIcon size={18} strokeWidth={1.75} />}
              />
              <MediaAttachment
                workshopId={workshopId}
                kind="audio"
                media={draft.audio}
                onChange={(audio) => patch({ audio })}
                label={t('inline.attachAudio')}
                icon={<AudioLines size={18} strokeWidth={1.75} />}
              />
            </div>
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
            <div style={{ marginTop: 14 }}>
              {!(draft.responseType === 'textuelle' && draft.answerOptional) && (
                <>
                  <FieldLabel hint={
                    draft.responseType === 'dessin' ? t('editor.answerHintDessin') :
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

          {/* questions liées — exactement le formulaire d'une question standard
              (`QuestionFields`, partagé avec l'éditeur en ligne de la feuille),
              privé des seuls éléments communs : image, audio et libellés restent
              saisis une fois pour toute la grappe. Séparées par un simple filet,
              sans encadré. */}
          <SectionDivider title={t('editor.partsDivider')} />
          <div style={{ fontSize: 12, color: palette.inkSoft, marginBottom: 10 }}>
            {t('editor.partsIntro')}
          </div>
          {draft.parts.map((part, idx) => (
            <div
              key={idx}
              style={{ paddingTop: 14, marginBottom: 14, borderTop: `1px solid ${ink(0.10)}`, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}
            >
              <QuestionFields
                values={part}
                onChange={(p) => patchPart(idx, p as Partial<QuestionPart>)}
                // Le popup n'a pas de copie sous les yeux : la question
                // principale y est la 1, ses questions liées suivent.
                number={idx + 2}
                advancedOpen={partsAdvanced}
                notions={notions}
                // L'image est celle de la grappe, saisie plus haut sur la
                // question principale.
                hasImage={!!draft.image}
                onRemove={() => removePart(idx)}
                statementPlaceholder={t('inline.linkedStatementPlaceholder')}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <button
              onClick={() => patch({ parts: [...draft.parts, emptyPart()] })}
              style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: `1px dashed ${ink(0.18)}`, background: 'transparent', color: palette.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('editor.addPart')}
            </button>
            {draft.parts.length > 0 && (
              <button
                onClick={() => setPartsAdvanced((v) => !v)}
                style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${partsAdvanced ? palette.greenSoft : ink(0.14)}`, background: partsAdvanced ? withAlpha(palette.green, 0.12) : 'transparent', color: partsAdvanced ? palette.green : palette.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('inline.advanced')}
              </button>
            )}
          </div>

          {/* options avancées */}
          <SectionDivider title={t('editor.optionsDivider')} />

          {/* Plus de sélecteur de niveau ici (28/08/2026) : le niveau appartient
              au couple question ↔ notion, et se règle sur la pastille de chaque
              notion, juste en dessous. */}

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
              <SelectMenu
                items={notions.filter((n) => !draft.notionIds.includes(n.id)).map((n) => ({ value: n.id, label: n.title }))}
                onSelect={toggleNotion}
                onScroll="clip"
                wrapperStyle={{ display: 'block', width: '100%' }}
                triggerStyle={{ width: '100%', textAlign: 'left', fontSize: 13, color: palette.inkMuted, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}
              >
                {t('editor.addNotionOption')}
              </SelectMenu>
            )}
          </div>

          {/* libellés */}
          <div>
            <FieldLabel hint={t('editor.labelsHint')}>{t('editor.labelsLabel')}</FieldLabel>
            {draft.pools.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {/* Pas de crayon ici, contrairement à l'éditeur de l'onglet
                    examen : le parcours ne sait que créer un libellé
                    (`createParcoursPool`), pas le modifier ni le supprimer. */}
                {draft.pools.map((pid) => {
                  const p = pools.find((pp) => pp.id === pid);
                  if (!p) return null;
                  return (
                    <LabelPill
                      key={pid}
                      name={p.name}
                      color={p.color}
                      size="md"
                      onRemove={() => togglePool(pid)}
                      removeTitle={t('inline.removeLabel')}
                    />
                  );
                })}
              </div>
            )}
            {/* Même menu que l'éditeur posé sur la feuille (`LabelPicker`) :
                choisir et créer se font dans le panneau. Pas de crayon ici pour
                la même raison qu'au-dessus — cet éditeur ne sait pas modifier un
                libellé. Le panneau prolonge le bouton, qui fait toute la largeur
                de la colonne. */}
            <LabelPicker
              pools={pools}
              selected={draft.pools}
              onToggle={togglePool}
              onCreate={addPool}
              panelWidth="trigger"
              wrapperStyle={{ display: 'block', width: '100%' }}
              triggerStyle={{ width: '100%', textAlign: 'left', fontSize: 13, color: palette.inkMuted, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '9px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              {t('editor.addLabelOption')}
            </LabelPicker>
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
