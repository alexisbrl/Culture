'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────

export type QuestionType = 'textuel' | 'visuel' | 'audio';

export type ResponseType =
  | 'sans_reponse'
  | 'qcs'
  | 'qcm'
  | 'textuelle'
  | 'dessin'
  | 'audio'
  | 'sondage'
  | 'fill_blank'
  | 'matching'
  | 'ordre';

export type Question = {
  id: string;
  questionType: QuestionType;
  responseType: ResponseType;
  content: string;
  answer: string;
  choices: string[];
  correctChoices: number[];
  pools: string[];
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number };
  linkedQuestionIds: string[];
  examIds: string[];
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  textuel: 'Textuel',
  visuel: 'Visuel',
  audio: 'Audio',
};

export const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  sans_reponse: 'Sans réponse',
  qcs: 'QCS',
  qcm: 'QCM',
  textuelle: 'Textuelle',
  dessin: 'Dessin',
  audio: 'Audio',
  sondage: 'Sondage',
  fill_blank: 'Fill in the blank',
  matching: 'Matching',
  ordre: "Trier dans l'ordre",
};

const RESPONSE_TYPE_ORDER: ResponseType[] = [
  'sans_reponse', 'qcs', 'qcm', 'textuelle', 'dessin', 'audio', 'sondage', 'fill_blank', 'matching', 'ordre',
];

const CHOICE_BASED: ResponseType[] = ['qcs', 'qcm', 'sondage', 'matching', 'ordre'];

export function emptyQuestion(): Question {
  return {
    id: 'q' + Date.now(),
    questionType: 'textuel',
    responseType: 'sans_reponse',
    content: '',
    answer: '',
    choices: [],
    correctChoices: [],
    pools: [],
    difficulty: { enabled: false, value: 5 },
    duration: { enabled: false, minutes: 2 },
    linkedQuestionIds: [],
    examIds: [],
  };
}

// ─── Small building blocks (cohérents avec le design system du projet) ─────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#9a948a' }}>{children}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#9a948a', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              fontSize: 12.5,
              padding: '7px 13px',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)',
              background: active ? '#2d2a24' : 'rgba(255,255,255,0.7)',
              color: active ? '#f4f0e6' : '#3a352c',
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

function MiniSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none',
        background: value ? '#7a9968' : 'rgba(45,42,36,0.14)',
        cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start', transition: 'all 0.18s',
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }} />
    </button>
  );
}

function TextField({ value, onChange, placeholder, multiline, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number }) {
  const style: React.CSSProperties = {
    width: '100%', fontSize: 13, color: '#2d2a24', border: '1px solid rgba(45,42,36,0.12)',
    borderRadius: 9, padding: '9px 12px', background: '#fff', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' as const,
  };
  if (multiline) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={style} />;
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={style} />;
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 14px' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#2d2a24', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(45,42,36,0.08)' }} />
    </div>
  );
}

// ─── Choice list editor (QCS / QCM / Sondage / Matching / Trier dans l'ordre) ─

function ChoiceListEditor({
  responseType,
  choices,
  correctChoices,
  onChange,
}: {
  responseType: ResponseType;
  choices: string[];
  correctChoices: number[];
  onChange: (choices: string[], correctChoices: number[]) => void;
}) {
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

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= choices.length) return;
    const next = [...choices];
    [next[i], next[j]] = [next[j], next[i]];
    const remap = (c: number) => (c === i ? j : c === j ? i : c);
    onChange(next, correctChoices.map(remap));
  }

  function toggleCorrect(i: number) {
    if (responseType === 'qcs') {
      onChange(choices, [i]);
    } else if (responseType === 'qcm') {
      const has = correctChoices.includes(i);
      onChange(choices, has ? correctChoices.filter((c) => c !== i) : [...correctChoices, i]);
    }
  }

  const showOrder = responseType === 'ordre';
  const showPairs = responseType === 'matching';
  const showCorrectMarker = responseType === 'qcs' || responseType === 'qcm';

  return (
    <div>
      {choices.length === 0 && (
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#a87a3a', padding: '4px 0 10px' }}>
          « ajoute {showPairs ? 'des paires' : 'des options de réponse'} »
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {choices.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showOrder && (
              <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums', width: 18, textAlign: 'center' as const }}>{i + 1}</span>
            )}
            {showCorrectMarker && (
              <button
                onClick={() => toggleCorrect(i)}
                title={responseType === 'qcs' ? 'bonne réponse (unique)' : 'bonne réponse'}
                style={{
                  width: 20, height: 20, borderRadius: responseType === 'qcs' ? '50%' : 6, flexShrink: 0,
                  border: correctChoices.includes(i) ? 'none' : '1.5px solid rgba(45,42,36,0.18)',
                  background: correctChoices.includes(i) ? '#7a9968' : '#fff',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, cursor: 'pointer', padding: 0,
                }}
              >
                {correctChoices.includes(i) ? '✓' : ''}
              </button>
            )}
            {showPairs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <TextField value={c.split(' :: ')[0] ?? ''} onChange={(v) => updateChoice(i, `${v} :: ${c.split(' :: ')[1] ?? ''}`)} placeholder={`élément ${i + 1}`} />
                <span style={{ fontSize: 12, color: '#9a948a' }}>→</span>
                <TextField value={c.split(' :: ')[1] ?? ''} onChange={(v) => updateChoice(i, `${c.split(' :: ')[0] ?? ''} :: ${v}`)} placeholder="correspondance" />
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <TextField value={c} onChange={(v) => updateChoice(i, v)} placeholder={`option ${i + 1}`} />
              </div>
            )}
            {showOrder && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#d8d4cb' : '#7a766d', padding: 0, lineHeight: 1, fontSize: 11 }}>▲</button>
                <button onClick={() => move(i, 1)} disabled={i === choices.length - 1} style={{ border: 'none', background: 'none', cursor: i === choices.length - 1 ? 'default' : 'pointer', color: i === choices.length - 1 ? '#d8d4cb' : '#7a766d', padding: 0, lineHeight: 1, fontSize: 11 }}>▼</button>
              </div>
            )}
            <button onClick={() => removeChoice(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b85a4a', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <button onClick={addChoice} style={{ marginTop: 10, fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px dashed rgba(45,42,36,0.20)', background: 'transparent', color: '#7a766d', cursor: 'pointer', fontFamily: 'inherit' }}>
        + {showPairs ? 'paire' : 'option'}
      </button>
      {(responseType === 'qcs' || responseType === 'qcm') && choices.length > 0 && correctChoices.length === 0 && (
        <div style={{ fontSize: 11.5, color: '#b85a4a', marginTop: 8 }}>indique au moins une bonne réponse en cochant l&apos;option correspondante</div>
      )}
    </div>
  );
}

// ─── Question editor panel ───────────────────────────────────────────────

export default function QuestionEditor({
  question,
  allQuestions,
  pools,
  onCreatePool,
  onSave,
  onCancel,
}: {
  question: Question;
  allQuestions: Question[];
  pools: { id: string; name: string; color: string }[];
  onCreatePool: (name: string) => string;
  onSave: (q: Question) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Question>(question);
  const [newPoolName, setNewPoolName] = useState('');
  const [creatingPool, setCreatingPool] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const isNew = !allQuestions.some((q) => q.id === question.id);
  const canSave = draft.content.trim().length > 0;
  const isChoiceBased = CHOICE_BASED.includes(draft.responseType);
  const hasAnswerField = !['sans_reponse', 'sondage'].includes(draft.responseType) && !isChoiceBased;

  function patch(p: Partial<Question>) {
    setDraft((d) => ({ ...d, ...p }));
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      {/* backdrop */}
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />

      {/* panel */}
      <div style={{ position: 'relative', width: 460, maxWidth: '94vw', height: '100%', background: '#fcf9f2', boxShadow: '-16px 0 48px rgba(45,42,36,0.18)', display: 'flex', flexDirection: 'column', fontFamily: "'Inter Tight', system-ui, sans-serif" }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(45,42,36,0.08)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#2d2a24' }}>{isNew ? 'Nouvelle question' : 'Modifier la question'}</div>
            <div style={{ fontSize: 12, color: '#7a766d' }}>générée manuellement ou retravaillée avec l&apos;IA</div>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontFamily: 'inherit' }}>×</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 24px' }}>
          {/* type de question */}
          <FieldLabel hint="Textuel par défaut · Visuel (image, graphique) et Audio disponibles">Type de question</FieldLabel>
          <Segmented value={draft.questionType} onChange={(v) => patch({ questionType: v })} options={(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((k) => ({ value: k, label: QUESTION_TYPE_LABELS[k] }))} />

          {draft.questionType === 'visuel' && (
            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, border: '1px dashed rgba(45,42,36,0.18)', background: 'rgba(255,255,255,0.6)', fontSize: 12, color: '#7a766d' }}>
              <div style={{ marginBottom: 6 }}>📎 joindre une image ou un graphique</div>
              <button disabled style={{ fontSize: 11.5, padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(45,42,36,0.04)', color: '#9a948a', cursor: 'not-allowed', fontFamily: 'inherit' }}>
                éditer l&apos;image — outil basique à venir
              </button>
            </div>
          )}
          {draft.questionType === 'audio' && (
            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, border: '1px dashed rgba(45,42,36,0.18)', background: 'rgba(255,255,255,0.6)', fontSize: 12, color: '#7a766d' }}>
              🎙️ enregistrement / import audio — outil à venir
            </div>
          )}

          {/* contenu */}
          <div style={{ marginTop: 18 }}>
            <FieldLabel hint={draft.responseType === 'fill_blank' ? 'utilise « ___ » pour marquer chaque trou à compléter' : undefined}>Énoncé de la question</FieldLabel>
            <TextField value={draft.content} onChange={(v) => patch({ content: v })} placeholder="Écris ou colle l'énoncé de la question…" multiline rows={4} />
          </div>

          {/* type de réponse */}
          <div style={{ marginTop: 18 }}>
            <FieldLabel hint="Sans réponse par défaut">Type de réponse</FieldLabel>
            <Segmented
              value={draft.responseType}
              onChange={(v) => patch({ responseType: v, choices: CHOICE_BASED.includes(v) ? (draft.choices.length ? draft.choices : ['', '']) : draft.choices, correctChoices: [] })}
              options={RESPONSE_TYPE_ORDER.map((k) => ({ value: k, label: RESPONSE_TYPE_LABELS[k] }))}
            />
          </div>

          {/* réponse / choix selon le type */}
          {isChoiceBased && (
            <div style={{ marginTop: 14 }}>
              <FieldLabel hint={
                draft.responseType === 'qcs' ? 'une seule bonne réponse' :
                draft.responseType === 'qcm' ? 'une ou plusieurs bonnes réponses' :
                draft.responseType === 'sondage' ? 'sondage sans correction' :
                draft.responseType === 'matching' ? 'associe chaque élément à sa correspondance' :
                "l'ordre de la liste ci-dessous est l'ordre correct"
              }>
                {draft.responseType === 'matching' ? 'Paires à associer' : draft.responseType === 'ordre' ? 'Éléments à ordonner' : 'Options de réponse'}
              </FieldLabel>
              <ChoiceListEditor
                responseType={draft.responseType}
                choices={draft.choices}
                correctChoices={draft.correctChoices}
                onChange={(choices, correctChoices) => patch({ choices, correctChoices })}
              />
            </div>
          )}

          {hasAnswerField && (
            <div style={{ marginTop: draft.questionType === 'visuel' || draft.questionType === 'audio' ? 14 : 14 }}>
              <FieldLabel hint={
                draft.responseType === 'fill_blank' ? 'réponses attendues pour chaque trou, séparées par une virgule, dans l\'ordre' :
                draft.responseType === 'dessin' ? 'description ou image de référence pour la correction (outil dessin à venir)' :
                draft.responseType === 'audio' ? 'transcription ou éléments attendus dans la réponse audio' :
                'utilisée pour la correction assistée par IA'
              }>
                {draft.responseType === 'fill_blank' ? 'Réponses attendues' : 'Réponse associée'}
              </FieldLabel>
              <TextField value={draft.answer} onChange={(v) => patch({ answer: v })} placeholder="Réponse de référence…" multiline rows={3} />
            </div>
          )}
          {draft.responseType === 'sans_reponse' && (
            <div style={{ marginTop: 14, fontSize: 12, color: '#9a948a' }}>cette question n&apos;a pas de réponse associée — aucune correction ne sera proposée.</div>
          )}

          {/* options avancées */}
          <SectionDivider title="Options par question" />

          {/* libellés */}
          <div>
            <FieldLabel hint="off par défaut — regroupe les questions pour générer des examens">Libellés</FieldLabel>
            {draft.pools.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {draft.pools.map((pid) => {
                  const p = pools.find((pp) => pp.id === pid);
                  if (!p) return null;
                  return (
                    <span key={pid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.10)', background: '#2d2a24', color: '#f4f0e6' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                      {p.name}
                      <button onClick={() => togglePool(pid)} style={{ border: 'none', background: 'none', color: '#f4f0e6', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {creatingPool ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <TextField value={newPoolName} onChange={setNewPoolName} placeholder="nom du libellé…" />
                </div>
                <button onClick={addPool} style={{ fontSize: 12, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>ajouter</button>
                <button onClick={() => { setCreatingPool(false); setNewPoolName(''); }} style={{ fontSize: 12, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(45,42,36,0.10)', background: 'transparent', color: '#9a948a', cursor: 'pointer', fontFamily: 'inherit' }}>annuler</button>
              </div>
            ) : (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value === '__new__') setCreatingPool(true);
                  else if (e.target.value) togglePool(e.target.value);
                }}
                style={{ width: '100%', fontSize: 13, color: '#5a564c', border: '1px solid rgba(45,42,36,0.12)', borderRadius: 9, padding: '9px 12px', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}
              >
                <option value="">+ ajouter un libellé…</option>
                {pools.filter((p) => !draft.pools.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__new__">+ nouveau libellé…</option>
              </select>
            )}
          </div>

          {/* difficulté */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <FieldLabel hint="off par défaut — annote la difficulté de la question">Difficulté</FieldLabel>
            <MiniSwitch value={draft.difficulty.enabled} onChange={(v) => patch({ difficulty: { ...draft.difficulty, enabled: v } })} />
          </div>
          {draft.difficulty.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -4 }}>
              <input type="range" min={1} max={10} value={draft.difficulty.value} onChange={(e) => patch({ difficulty: { ...draft.difficulty, value: Number(e.target.value) } })} style={{ flex: 1, accentColor: '#a87a3a' }} />
              <span style={{ fontSize: 12.5, color: '#2d2a24', fontVariantNumeric: 'tabular-nums', width: 32, textAlign: 'right' as const }}>{draft.difficulty.value}/10</span>
            </div>
          )}

          {/* durée */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <FieldLabel hint="off par défaut — durée allouée, uniquement pour les examens projetés">Durée</FieldLabel>
            <MiniSwitch value={draft.duration.enabled} onChange={(v) => patch({ duration: { ...draft.duration, enabled: v } })} />
          </div>
          {draft.duration.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -4 }}>
              <div style={{ width: 90 }}>
                <input type="number" min={1} value={draft.duration.minutes} onChange={(e) => patch({ duration: { ...draft.duration, minutes: Math.max(1, Number(e.target.value) || 1) } })} style={{ width: '100%', fontSize: 13, color: '#2d2a24', border: '1px solid rgba(45,42,36,0.12)', borderRadius: 9, padding: '9px 12px', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <span style={{ fontSize: 12.5, color: '#7a766d' }}>minutes</span>
            </div>
          )}

          {/* discussion IA */}
          <div style={{ marginTop: 18 }}>
            <FieldLabel hint="discute avec l'IA pour générer ou retravailler cette question">Discussion IA</FieldLabel>
            <button onClick={() => setAiOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(232,184,108,0.14)', color: '#7a4d20', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 14 }}>✦</span> discuter avec l&apos;IA
            </button>
            {aiOpen && (
              <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.08)', background: 'rgba(255,255,255,0.7)' }}>
                <textarea disabled placeholder="« reformule cette question pour un niveau débutant… » — bientôt disponible" rows={2} style={{ width: '100%', fontSize: 12.5, color: '#9a948a', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 8, padding: '8px 10px', background: 'rgba(45,42,36,0.02)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none' as const }} />
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: '1px solid rgba(45,42,36,0.08)', flexShrink: 0, background: '#fcf9f2' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button
            disabled={!canSave}
            onClick={() => onSave(draft)}
            style={{ flex: 2, padding: '11px 14px', borderRadius: 10, border: 'none', background: canSave ? '#2d2a24' : 'rgba(45,42,36,0.12)', color: canSave ? '#fff' : '#9a948a', fontSize: 13, fontWeight: 500, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
          >
            {isNew ? 'Ajouter la question' : 'Enregistrer les modifications'}
          </button>
        </div>
      </div>
    </div>
  );
}
