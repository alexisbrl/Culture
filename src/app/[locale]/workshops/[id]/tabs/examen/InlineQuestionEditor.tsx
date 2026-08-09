'use client';

// Édition d'une question DIRECTEMENT sur la feuille d'examen (maquette
// `App-Culture.dc.html`, bloc `sq.isEditing`, lignes 1047-1168, et blocs par
// type `_typeVisual`, lignes 3034-3229). Remplace le popup `QuestionEditor`
// pour tout le flux examen : créer, modifier, retirer.
//
// Le popup subsiste ailleurs — l'onglet Parcours l'utilise aussi et n'a pas de
// feuille sur laquelle éditer. Les briques de formulaire (champs, liste de
// choix) sont importées de ce fichier plutôt que redéfinies : une seule
// implémentation des règles de saisie pour les deux éditeurs.
//
// Le bloc est monté À LA PLACE du rendu figé de la question, dans le flux de la
// feuille : il participe donc à la mesure de hauteur (`qRefs`) et la pagination
// A4 se recalcule pendant la frappe, sans traitement particulier.
//
// ─── « Paramètres avancés » ──────────────────────────────────────────────────
// Ce n'est PAS un panneau qui s'ouvre en bas : c'est un interrupteur qui révèle
// des options supplémentaires **à leur place naturelle** dans le formulaire
// (bouton audio à côté du bouton image, barème étendu à la place du simple
// « / n pts », bouton d'attendus sous la réponse, bloc de notions). L'interface
// par défaut ne montre que l'essentiel ; rien ne se déplace à l'ouverture.
//
// ─── Un bloc d'édition par type de réponse ───────────────────────────────────
// Neuf types au menu (QCM, texte, liste, tableau, matching, dessin, fichier,
// audio, vide). Les réglages propres à un type vivent dans `draft.typeOptions`
// (jsonb `type_options`), jamais en champs de premier niveau : voir
// `QuestionTypeOptions` dans `@/lib/workshops/examTypes`.

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Ban, ChevronDown, CircleMinus, Clock, File, ImageIcon, Link2, Mic,
  Palette, Search, SlidersHorizontal, X,
} from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import {
  type Question, type ResponseType, type BloomLevel,
  CHOICE_BASED, RESPONSE_TYPE_ORDER, RESPONSE_TYPE_V2,
  ChoiceListEditor, FieldLabel, MiniSwitch, TextField,
  emptyPart,
} from '../QuestionEditor';
import {
  BLOOM_LEVELS, DEFAULT_BLOOM_LEVEL, DEFAULT_FILE_TYPES, FILE_TYPE_KEYS,
  MATCH_SPLIT_DEFAULT, MATCH_SPLIT_MAX, MATCH_SPLIT_MIN,
  type QuestionTypeOptions, type QuestionWeight,
} from '@/lib/workshops/examTypes';
// Les icônes de types de réponse sont partagées avec la banque de questions.
import { RESPONSE_TYPE_ICONS as TYPE_ICONS } from './examShared';

type Props = {
  question: Question;
  /** Numéro affiché sur la copie (« 2. »), pour rester aligné sur le rendu figé. */
  number: number;
  /** Vrai si la question vient d'être créée : le libellé et l'annulation changent. */
  isNew: boolean;
  pools: { id: string; name: string; color: string }[];
  notions: { id: string; title: string }[];
  /** Pondération de la question — elle appartient à l'examen, pas à la question. */
  weight: QuestionWeight;
  onWeightChange: (patch: Partial<QuestionWeight>) => void;
  onCreatePool: (name: string) => string;
  onSave: (q: Question) => void;
  onCancel: () => void;
};

const DEFAULT_TABLE_ROWS = 2;
const DEFAULT_TABLE_COLS = 3;
const MAX_TABLE_COLS = 5;

export default function InlineQuestionEditor({
  question, number, isNew, pools, notions, weight, onWeightChange, onCreatePool, onSave, onCancel,
}: Props) {
  const t = useTranslations('examen');
  const [draft, setDraft] = useState<Question>({
    ...question,
    bloomLevel: question.bloomLevel ?? DEFAULT_BLOOM_LEVEL,
    notionIds: question.notionIds ?? [],
    expectations: question.expectations ?? '',
    typeOptions: question.typeOptions ?? {},
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [expectationsOpen, setExpectationsOpen] = useState(false);
  const [notionQuery, setNotionQuery] = useState('');
  const [newPoolName, setNewPoolName] = useState('');
  const [creatingPool, setCreatingPool] = useState(false);
  /** Bloc des paires — sert de référentiel de largeur au curseur de partage. */
  const matchRowsRef = useRef<HTMLDivElement>(null);

  const rt = draft.responseType;
  const isQcm = rt === 'qcm' || rt === 'qcs';
  const canSave = draft.content.trim().length > 0;
  const hasExpectations = (draft.expectations ?? '').trim().length > 0;
  const opts = draft.typeOptions ?? {};

  function patch(p: Partial<Question>) {
    setDraft(d => ({ ...d, ...p }));
  }
  function patchOptions(p: Partial<QuestionTypeOptions>) {
    setDraft(d => ({ ...d, typeOptions: { ...(d.typeOptions ?? {}), ...p } }));
  }
  function patchPart(idx: number, p: Partial<Question['parts'][number]>) {
    patch({ parts: draft.parts.map((pt, i) => (i === idx ? { ...pt, ...p } : pt)) });
  }
  function togglePool(id: string) {
    patch({ pools: draft.pools.includes(id) ? draft.pools.filter(p => p !== id) : [...draft.pools, id] });
  }
  function toggleNotion(id: string) {
    patch({ notionIds: draft.notionIds.includes(id) ? draft.notionIds.filter(n => n !== id) : [...draft.notionIds, id] });
  }
  function addPool() {
    const name = newPoolName.trim();
    if (!name) return;
    patch({ pools: [...draft.pools, onCreatePool(name)] });
    setNewPoolName('');
    setCreatingPool(false);
  }
  /** Un seul niveau de Bloom par question dans le modèle : la pastille portée par
   *  chaque notion pilote donc le niveau de la QUESTION (la maquette en prévoit
   *  un par notion — divergence assumée, voir docs/backlog.md). */
  function cycleBloom() {
    const i = BLOOM_LEVELS.indexOf(draft.bloomLevel);
    patch({ bloomLevel: BLOOM_LEVELS[(i + 1) % BLOOM_LEVELS.length] as BloomLevel });
  }

  /** Ce qui est déjà saisi suit le changement de type. Un même contenu porte le
   *  même sens d'un type à l'autre : les lignes d'un QCM, les éléments d'une
   *  liste, la colonne de gauche d'une paire et les lignes d'un tableau sont
   *  les « éléments » ; la colonne de droite d'une paire et les colonnes d'un
   *  tableau sont les « correspondances ». */
  function carriedOver(): { items: string[]; matches: string[] } {
    if (rt === 'tableau') return { items: opts.tableRows ?? [], matches: opts.tableCols ?? [] };
    // `choices` peut porter l'encodage « élément :: correspondance » des paires —
    // y compris après un détour par un type sans saisie, qui le conserve tel quel.
    const parts = draft.choices.map(c => c.split(' :: '));
    const paired = parts.some(p => p.length > 1);
    return { items: parts.map(p => p[0] ?? ''), matches: paired ? parts.map(p => p[1] ?? '') : [] };
  }
  /** Complète la liste de lignes vides jusqu'à `n` (jamais de libellé en dur :
   *  les cases vides affichent leur placeholder). */
  function padRows(arr: string[], n: number): string[] {
    return arr.length >= n ? arr : [...arr, ...Array.from({ length: n - arr.length }, () => '')];
  }

  /** Changement de type depuis le menu. Choisir « QCM » alors que la question
   *  est déjà en `qcs` ne la ramène pas à `qcm` : la variante « réponse unique »
   *  est un réglage de QCM, pas un autre type. */
  function selectType(next: ResponseType) {
    setTypeMenuOpen(false);
    if (next === 'qcm' && isQcm) return;
    if (next === rt) return;
    const { items, matches } = carriedOver();
    const nextChoices =
      next === 'matching' ? padRows(items, 3).map((it, i) => `${it} :: ${matches[i] ?? ''}`)
      : CHOICE_BASED.includes(next) || next === 'liste' ? padRows(items, 2)
      // Types sans saisie : on conserve `choices` tel quel pour un retour
      // ultérieur — sauf en venant du tableau, dont les lignes vivent dans
      // `typeOptions` et seraient perdues sans cette recopie.
      : rt === 'tableau' ? items : draft.choices;
    patch({ responseType: next, choices: nextChoices, correctChoices: [] });
    if (next === 'tableau') {
      // Les éléments deviennent les lignes, les correspondances les colonnes.
      // À défaut (aucun contenu à reprendre), on garde la grille déjà saisie —
      // sinon un aller-retour par un type sans saisie l'effacerait.
      const filled = (arr: string[]) => arr.some(v => v.trim() !== '');
      const rows = filled(items) ? padRows(items, DEFAULT_TABLE_ROWS) : (opts.tableRows?.length ? opts.tableRows : padRows([], DEFAULT_TABLE_ROWS));
      const cols = filled(matches) ? matches : (opts.tableCols?.length ? opts.tableCols : padRows([], DEFAULT_TABLE_COLS));
      const sameGrid = JSON.stringify(rows) === JSON.stringify(opts.tableRows ?? []) && JSON.stringify(cols) === JSON.stringify(opts.tableCols ?? []);
      patchOptions({ tableRows: rows, tableCols: cols, tableChecked: sameGrid ? (opts.tableChecked ?? []) : [] });
    }
    if (next === 'liste') patchOptions({ listExpected: Math.min(opts.listExpected ?? nextChoices.length, nextChoices.length) });
    if (next === 'fichier' && !opts.fileTypes) patchOptions({ fileTypes: DEFAULT_FILE_TYPES });
  }

  const selectStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: palette.ink, border: `1px solid ${palette.lineStrong}`,
    borderRadius: 10, padding: '8px 12px', background: palette.surfaceRaised, outline: 'none',
    fontFamily: 'inherit', cursor: 'pointer',
  };
  const footerBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  };
  const numInput: React.CSSProperties = {
    width: 52, fontSize: 13, fontWeight: 600, color: palette.ink, border: `1px solid ${palette.lineStrong}`,
    borderRadius: 8, padding: '6px 8px', background: palette.surfaceRaised, outline: 'none',
    fontFamily: 'inherit', textAlign: 'center',
  };
  const groupLabel: React.CSSProperties = {
    width: 56, flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
    color: palette.inkMuted, lineHeight: 1.3,
  };
  const cardField: React.CSSProperties = {
    border: `1px solid ${palette.lineStrong}`, borderRadius: 8, background: palette.surfaceRaised,
    fontFamily: 'inherit', color: palette.ink, outline: 'none', boxSizing: 'border-box',
  };
  const addLink: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: palette.tanStrong, background: 'transparent',
    border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit',
  };
  /** Retrait d'une ligne : la croix garde sa place même quand elle est masquée,
   *  sinon les champs sautent d'une ligne à l'autre. */
  const rowRemove: React.CSSProperties = {
    flex: 'none', width: 19, border: 'none', background: 'transparent', color: palette.inkFaint,
    cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const notionMatches = notions.filter(n =>
    !draft.notionIds.includes(n.id) && n.title.toLowerCase().includes(notionQuery.trim().toLowerCase()),
  );

  const attendusButton = advancedOpen ? (
    <button
      type="button"
      onClick={() => setExpectationsOpen(v => !v)}
      title={t('inline.expectationsTitle')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600,
        color: palette.tanStrong, background: 'transparent', border: `1px dashed ${palette.lineStrong}`,
        borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit', flex: 'none',
      }}
    >
      {expectationsOpen ? t('inline.expectationsHide') : (hasExpectations ? t('inline.expectationsShow') : t('inline.expectationsAdd'))}
    </button>
  ) : null;

  // ─── Blocs d'édition par type ──────────────────────────────────────────────

  function renderTypeBlock() {
    switch (rt) {
      case 'qcm':
      case 'qcs':
        return (
          <div>
            <ChoiceListEditor
              responseType={rt}
              choices={draft.choices}
              correctChoices={draft.correctChoices}
              onChange={(choices, correctChoices) => patch({ choices, correctChoices })}
              hideAddButton
            />
            <ControlRow trailing={attendusButton}>
              <button type="button" onClick={() => patch({ choices: [...draft.choices, ''] })} style={addLink}>
                {t('choices.addOption')}
              </button>
              <PillToggle
                on={rt === 'qcs'}
                onClick={() => patch({ responseType: rt === 'qcs' ? 'qcm' : 'qcs', correctChoices: [] })}
                label={t('inline.uniqueAnswer')}
                title={t('inline.uniqueAnswerHint')}
              />
              {advancedOpen && (
                <PillToggle
                  on={draft.shuffleChoices}
                  onClick={() => patch({ shuffleChoices: !draft.shuffleChoices })}
                  label={t('inline.shuffle')}
                  title={t('editor.shuffleHint')}
                />
              )}
            </ControlRow>
          </div>
        );

      case 'textuelle':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* La réponse attendue est toujours saisissable : l'interrupteur
                « réponse libre » (qui masquait ce champ) a été retiré de
                l'éditeur en ligne. Sans lui, garder la condition sur
                `answerOptional` rendrait le champ inatteignable sur une
                question enregistrée avant le retrait. */}
            <AutoTextarea
              value={draft.answer}
              onChange={v => patch({ answer: v })}
              placeholder={t('editor.answerPlaceholder')}
              minHeight={62}
              fontSize={13}
              bold={false}
            />
            <ControlRow trailing={attendusButton}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: palette.inkMuted }}>{t('inline.lines')}</span>
                <input
                  type="number"
                  min={1}
                  value={draft.textLines ?? 3}
                  onChange={e => patch({ textLines: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ ...numInput, width: 54 }}
                />
              </div>
            </ControlRow>
          </div>
        );

      // Liste : l'élève saisit plusieurs réponses, une par ligne. Les lignes
      // saisies ici sont les réponses de référence, pas ce qui s'imprime.
      case 'liste': {
        const items = draft.choices.length ? draft.choices : ['', '', ''];
        const numbered = opts.listNumbered ?? true;
        const expected = opts.listExpected ?? items.length;
        // Le nombre de réponses attendues suit l'ajout/retrait de lignes, borné
        // par [1, nombre de lignes] : on ne peut pas en attendre plus qu'il n'y
        // a de références saisies.
        const commit = (arr: string[], expectedDelta: number) => {
          const next = Math.min(Math.max(expected + expectedDelta, 1), arr.length);
          patch({ choices: arr });
          patchOptions({ listExpected: next });
        };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {items.map((val, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {numbered && (
                  <span style={{ width: 22, flex: 'none', textAlign: 'center', fontSize: 12, fontWeight: 700, color: palette.green }}>{i + 1}</span>
                )}
                <input
                  value={val}
                  onChange={e => commit(items.map((x, j) => (j === i ? e.target.value : x)), 0)}
                  placeholder={t('editor.answerPlaceholder')}
                  style={{ ...cardField, flex: 1, minWidth: 0, padding: '9px 12px', fontSize: 13 }}
                />
                {items.length > 1 ? (
                  <button type="button" onClick={() => commit(items.filter((_, j) => j !== i), -1)} title={t('inline.removeRow')} style={rowRemove}>
                    <X size={13} strokeWidth={2.2} />
                  </button>
                ) : <span style={{ flex: 'none', width: 19 }} />}
              </div>
            ))}
            <ControlRow trailing={attendusButton}>
              <button type="button" onClick={() => commit([...items, ''], 1)} style={addLink}>{t('inline.addRow')}</button>
              <PillToggle on={numbered} onClick={() => patchOptions({ listNumbered: !numbered })} label={t('inline.numbers')} title={t('inline.numbersHint')} />
              {advancedOpen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: palette.inkMuted }}>{t('inline.expectedAnswers')}</span>
                  <input
                    type="number"
                    min={1}
                    max={items.length}
                    value={expected}
                    onChange={e => patchOptions({ listExpected: Math.min(Math.max(Number(e.target.value) || 1, 1), items.length) })}
                    style={{ ...numInput, width: 54 }}
                  />
                </div>
              )}
            </ControlRow>
          </div>
        );
      }

      // Tableau : grille lignes × colonnes à cocher.
      case 'tableau': {
        const rows = opts.tableRows ?? padRows([], DEFAULT_TABLE_ROWS);
        const cols = opts.tableCols ?? padRows([], DEFAULT_TABLE_COLS);
        const checked = opts.tableChecked ?? [];
        const unique = opts.tableUnique ?? false;
        const cellKey = (r: number, c: number) => `${r}-${c}`;
        const toggleCell = (r: number, c: number) => {
          const key = cellKey(r, c);
          if (checked.includes(key)) return patchOptions({ tableChecked: checked.filter(k => k !== key) });
          // en « réponse unique », cocher une case libère le reste de sa ligne
          const cleared = unique ? checked.filter(k => k.slice(0, k.indexOf('-')) !== String(r)) : checked;
          patchOptions({ tableChecked: [...cleared, key] });
        };
        const setUnique = () => {
          const willBe = !unique;
          if (!willBe) return patchOptions({ tableUnique: false });
          // en repassant à une seule réponse par ligne, on ne garde que la première case de chaque ligne
          const kept: string[] = [];
          rows.forEach((_r, ri) => {
            const first = checked.find(k => k.slice(0, k.indexOf('-')) === String(ri));
            if (first) kept.push(first);
          });
          patchOptions({ tableUnique: true, tableChecked: kept });
        };
        const labelCell = (val: string, ph: string, onCh: (v: string) => void, center?: boolean) => (
          <input
            value={val}
            placeholder={ph}
            onChange={e => onCh(e.target.value)}
            style={{ ...cardField, width: '100%', padding: '7px 10px', fontSize: 12.5, fontWeight: 600, textAlign: center ? 'center' : 'left' }}
          />
        );
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* en-tête : libellés de colonnes */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: '0 0 110px' }} />
              {cols.map((c, ci) => (
                <div key={ci} style={{ flex: '1 1 0', minWidth: 0 }}>
                  {labelCell(c, t('inline.tableColPlaceholder'), v => patchOptions({ tableCols: cols.map((x, j) => (j === ci ? v : x)) }), true)}
                </div>
              ))}
              <div style={{ flex: '0 0 24px' }} />
            </div>
            {/* corps : libellé de ligne + cases à cocher */}
            {rows.map((r, ri) => (
              <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: '0 0 110px' }}>
                  {labelCell(r, t('inline.tableRowPlaceholder'), v => patchOptions({ tableRows: rows.map((x, j) => (j === ri ? v : x)) }))}
                </div>
                {cols.map((_c, ci) => {
                  const on = checked.includes(cellKey(ri, ci));
                  return (
                    <div key={ci} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={() => toggleCell(ri, ci)}
                        title={t('inline.tableCheckHint')}
                        style={{
                          width: 22, height: 22, flex: 'none', boxSizing: 'border-box', cursor: 'pointer',
                          borderRadius: unique ? 999 : 6, background: palette.surfaceRaised,
                          border: on ? 'none' : `1.5px solid ${palette.lineStrong}`,
                          boxShadow: on ? `inset 0 0 0 7px ${palette.green}` : 'none',
                        }}
                      />
                    </div>
                  );
                })}
                {rows.length > 1 ? (
                  <button type="button" onClick={() => patchOptions({ tableRows: rows.filter((_, j) => j !== ri) })} title={t('inline.removeRow')} style={{ ...rowRemove, width: 24 }}>
                    <X size={13} strokeWidth={2.2} />
                  </button>
                ) : <div style={{ flex: '0 0 24px' }} />}
              </div>
            ))}
            {/* pied : retrait des colonnes */}
            {cols.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: '0 0 110px' }} />
                {cols.map((_c, ci) => (
                  <div key={ci} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                    <button type="button" onClick={() => patchOptions({ tableCols: cols.filter((_, j) => j !== ci) })} title={t('inline.removeColumn')} style={{ ...rowRemove, width: 'auto' }}>
                      <X size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
                <div style={{ flex: '0 0 24px' }} />
              </div>
            )}
            <ControlRow trailing={attendusButton}>
              <button type="button" onClick={() => patchOptions({ tableRows: [...rows, ''] })} style={addLink}>{t('inline.addTableRow')}</button>
              {cols.length < MAX_TABLE_COLS && (
                <button type="button" onClick={() => patchOptions({ tableCols: [...cols, ''] })} style={addLink}>{t('inline.addTableCol')}</button>
              )}
              <PillToggle on={unique} onClick={setUnique} label={t('inline.uniqueAnswer')} title={t('inline.tableUniqueHint')} />
            </ControlRow>
          </div>
        );
      }

      // Matching : les paires sont stockées « gauche :: droite » dans `choices`,
      // convention déjà utilisée par l'aperçu A4 (`renderAnswerSpace`).
      case 'matching': {
        const pairs = (draft.choices.length ? draft.choices : ['', '', '']).map(c => {
          const [l, r] = c.split(' :: ');
          return { l: l ?? '', r: r ?? '' };
        });
        const commit = (next: { l: string; r: string }[]) => patch({ choices: next.map(p => `${p.l} :: ${p.r}`) });
        const split = Math.min(Math.max(opts.matchSplit ?? MATCH_SPLIT_DEFAULT, MATCH_SPLIT_MIN), MATCH_SPLIT_MAX);
        // Curseur de partage : une seule valeur pour toute la question, donc
        // toutes les colonnes de gauche gardent la même largeur, et celles de
        // droite aussi. Bornée à 10 %-90 % pour qu'aucun côté ne disparaisse.
        const startSplitDrag = (startEvent: React.MouseEvent) => {
          startEvent.preventDefault();
          const box = matchRowsRef.current?.getBoundingClientRect();
          if (!box || box.width === 0) return;
          const move = (moveEvent: MouseEvent) => {
            const ratio = (moveEvent.clientX - box.left) / box.width;
            patchOptions({ matchSplit: Math.min(Math.max(ratio, MATCH_SPLIT_MIN), MATCH_SPLIT_MAX) });
          };
          const stop = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', stop);
          };
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', stop);
        };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div ref={matchRowsRef} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pairs.map((p, i) => (
                <MatchPairRow
                  key={i}
                  left={p.l}
                  right={p.r}
                  split={split}
                  leftPlaceholder={t('inline.matchLeft')}
                  rightPlaceholder={t('inline.matchRight')}
                  fieldStyle={cardField}
                  onLeftChange={v => commit(pairs.map((x, j) => (j === i ? { ...x, l: v } : x)))}
                  onRightChange={v => commit(pairs.map((x, j) => (j === i ? { ...x, r: v } : x)))}
                  onSplitDrag={startSplitDrag}
                  onRemove={pairs.length > 1 ? () => commit(pairs.filter((_, j) => j !== i)) : undefined}
                  removeTitle={t('inline.removeRow')}
                  splitTitle={t('inline.matchSplitHint')}
                />
              ))}
            </div>
            <ControlRow trailing={attendusButton}>
              <button type="button" onClick={() => commit([...pairs, { l: '', r: '' }])} style={addLink}>{t('inline.addRow')}</button>
            </ControlRow>
          </div>
        );
      }

      // Dessin / audio / fichier / vide : rien à corriger automatiquement, le
      // bloc montre à quoi ressemblera l'espace de réponse de l'élève.
      // Le réglage « basé sur l'image de la question » ne vit pas ici mais
      // juste sous le sélecteur de type (voir `typeSideToggle`) : le laisser
      // au-dessus du cadre de dessin creusait un vide dans la carte.
      case 'dessin':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ border: `1.5px dashed ${palette.amber}`, borderRadius: 10, background: palette.surfaceRaised, height: 132, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: palette.inkMuted }}>
              <Palette size={30} strokeWidth={1.6} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t('inline.drawHere')}</span>
            </div>
            <ControlRow trailing={attendusButton} />
          </div>
        );

      case 'audio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...cardField, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
              <span style={{ width: 40, height: 40, borderRadius: 999, background: palette.green, color: palette.onGreen, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Mic size={18} strokeWidth={1.75} />
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, height: 34 }}>
                {[10, 18, 26, 14, 22, 30, 16, 24, 12, 20, 28, 14, 18, 22, 12].map((h, i) => (
                  <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: palette.greenSoft }} />
                ))}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: palette.inkMuted, fontVariantNumeric: 'tabular-nums' }}>0:00</span>
            </div>
            <ControlRow trailing={attendusButton} />
          </div>
        );

      case 'fichier': {
        const accepted = opts.fileTypes ?? DEFAULT_FILE_TYPES;
        const toggleFileType = (k: string) => patchOptions({
          fileTypes: accepted.includes(k) ? accepted.filter(x => x !== k) : [...accepted, k],
        });
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {advancedOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: palette.inkMuted }}>
                  {t('inline.fileTypesLabel').toUpperCase()}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FILE_TYPE_KEYS.map(k => (
                    <PillToggle key={k} on={accepted.includes(k)} onClick={() => toggleFileType(k)} label={t(`fileType.${k}`)} />
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: palette.inkMuted }}>
                {t('inline.fileUrlLabel').toUpperCase()}
              </span>
              <div style={{ ...cardField, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '7px 11px' }}>
                <Link2 size={15} strokeWidth={1.75} style={{ flex: 'none', color: palette.inkFaint }} />
                <input
                  value={opts.fileUrl ?? ''}
                  onChange={e => patchOptions({ fileUrl: e.target.value })}
                  placeholder={t('inline.fileUrlPlaceholder')}
                  style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 12.5, color: palette.ink }}
                />
              </div>
            </div>
            <ControlRow trailing={attendusButton} />
          </div>
        );
      }

      case 'sans_reponse':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ border: `1.5px dashed ${palette.lineStrong}`, borderRadius: 8, background: palette.surfaceRaised, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, color: palette.inkMuted }}>
              <File size={20} strokeWidth={1.75} style={{ flex: 'none', color: palette.tanStrong }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {t('inline.emptyHintA')}<br />{t('inline.emptyHintB')}
              </span>
            </div>
            <ControlRow trailing={attendusButton} />
          </div>
        );
    }
  }

  const CurrentIcon = TYPE_ICONS[rt];

  return (
    <div
      style={{
        margin: '10px 26px', padding: '14px 16px', borderRadius: 14,
        border: `1px solid ${palette.greenSoft}`, background: withAlpha(palette.green, 0.06),
        display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box', minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: palette.green }}>
        {(isNew ? t('inline.newQuestion') : t('inline.editQuestion')).toUpperCase()} · {t(`responseType.${rt}`).toUpperCase()}
      </div>

      {/* énoncé + médias */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flex: 'none', fontSize: 14, fontWeight: 600, color: palette.ink, paddingTop: 10 }}>{number}.</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AutoTextarea value={draft.content} onChange={v => patch({ content: v })} placeholder={t('inline.statementPlaceholder')} />
        </div>
        {/* Image et audio sont des jalons V2 : boutons présents mais inactifs,
            pour que la place qu'ils occuperont soit déjà lisible. L'audio ne
            s'affiche qu'en mode avancé, comme dans la maquette. */}
        <MediaButton title={`${t('inline.attachImage')} · ${t('inline.soon')}`}><ImageIcon size={18} strokeWidth={1.75} /></MediaButton>
        {advancedOpen && <MediaButton title={`${t('inline.attachAudio')} · ${t('inline.soon')}`}><Mic size={18} strokeWidth={1.75} /></MediaButton>}
      </div>

      {/* type de réponse + barème */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px 24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 11, flex: 'none', minWidth: 0 }}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setTypeMenuOpen(v => !v)}
            title={t('editor.rTypeLabel')}
            style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: 9 }}
          >
            <span style={{ display: 'flex', color: palette.green }}><CurrentIcon size={16} strokeWidth={1.75} /></span>
            {t(`responseType.${rt}`)}
            <ChevronDown size={16} strokeWidth={1.75} style={{ color: palette.inkMuted, marginLeft: 2 }} />
          </button>
          {typeMenuOpen && (
            <>
              {/* capte le clic extérieur sans piéger le focus */}
              <div onClick={() => setTypeMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, minWidth: 224, maxHeight: 340, overflow: 'auto', background: palette.surfaceRaised, border: `1px solid ${palette.lineStrong}`, borderRadius: 12, boxShadow: `0 10px 30px ${ink(0.12)}`, padding: 5 }}>
                {RESPONSE_TYPE_ORDER.map(k => {
                  const Icon = TYPE_ICONS[k];
                  const active = k === 'qcm' ? isQcm : k === rt;
                  const soon = RESPONSE_TYPE_V2.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={soon}
                      onClick={() => selectType(k)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                        color: soon ? palette.inkFaint : palette.ink, background: active ? withAlpha(palette.green, 0.10) : 'transparent',
                        border: 'none', borderRadius: 8, padding: '8px 10px', cursor: soon ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', color: palette.green, flex: 'none' }}><Icon size={16} strokeWidth={1.75} /></span>
                      <span style={{ flex: 1 }}>{t(`responseType.${k}`)}{soon ? ' · V2' : ''}</span>
                      {active && <span style={{ color: palette.green, fontSize: 12, flex: 'none' }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {/* Réglage propre au type, collé sous le sélecteur pour ne pas creuser
            de vide dans la carte (maquette, `dessinAdv` l.1076). */}
        {rt === 'dessin' && advancedOpen && (
          <PillToggle
            on={opts.drawOnImage ?? false}
            onClick={() => patchOptions({ drawOnImage: !opts.drawOnImage })}
            label={t('inline.drawOnImage')}
            title={t('inline.drawOnImageHint')}
          />
        )}
        </div>

        {/* Barème : « / n pts » discret par défaut, deux lignes étiquetées
            (gain puis pénalité) une fois les paramètres avancés ouverts. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {advancedOpen && <span style={groupLabel}>{t('inline.scoreLabel').toUpperCase()}</span>}
            {!advancedOpen && <span style={{ fontSize: 14, fontWeight: 600, color: palette.inkMuted }}>/</span>}
            <input
              type="number"
              min={0}
              step={0.5}
              value={weight.points}
              onChange={e => onWeightChange({ points: Math.max(0, Number(e.target.value) || 0) })}
              title={t('inline.pointsTitle')}
              style={numInput}
            />
            <span style={{ fontSize: 10.5, color: palette.inkFaint }}>{t('inline.points')}</span>
            {advancedOpen && (
              <IconToggle
                active={weight.timed ?? false}
                title={t('inline.timedScore')}
                onClick={() => onWeightChange({ timed: !weight.timed })}
              >
                <Clock size={16} strokeWidth={1.75} />
              </IconToggle>
            )}
          </div>

          {advancedOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={groupLabel}>{t('inline.penaltyLabel').toUpperCase()}</span>
              {!weight.eliminatory && (
                <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: palette.danger }}>−</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={weight.negative.value}
                    onChange={e => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      onWeightChange({ negative: { enabled: v > 0, value: v } });
                    }}
                    title={t('inline.penaltyTitle')}
                    style={{ ...numInput, color: weight.negative.value > 0 ? palette.danger : palette.ink }}
                  />
                  <span style={{ fontSize: 10.5, color: palette.inkFaint }}>{t('inline.points')}</span>
                </>
              )}
              <IconToggle
                active={weight.eliminatory}
                activeTone="danger"
                title={t('inline.eliminatory')}
                onClick={() => onWeightChange({ eliminatory: !weight.eliminatory, negative: weight.eliminatory ? weight.negative : { enabled: false, value: 0 } })}
              >
                <Ban size={16} strokeWidth={1.75} />
              </IconToggle>
              <IconToggle
                active={weight.penalizeUnanswered ?? false}
                title={t('inline.penaltyScope')}
                onClick={() => onWeightChange({ penalizeUnanswered: !weight.penalizeUnanswered })}
              >
                <CircleMinus size={16} strokeWidth={1.75} />
              </IconToggle>
            </div>
          )}
        </div>
      </div>

      {renderTypeBlock()}

      {/* attendus : instructions de correction libres, repliées par défaut */}
      {advancedOpen && expectationsOpen && (
        <textarea
          value={draft.expectations ?? ''}
          onChange={e => patch({ expectations: e.target.value })}
          placeholder={t('inline.expectationsPlaceholder')}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 64,
            fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, color: palette.ink,
            background: palette.surfaceRaised, border: `1px solid ${palette.lineStrong}`,
            borderRadius: 8, padding: '9px 12px', outline: 'none',
          }}
        />
      )}

      {/* notions associées + libellés */}
      {advancedOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: palette.inkFaint }}>
            {t('inline.notionsTitle').toUpperCase()}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, boxSizing: 'border-box', background: palette.surfaceRaised, border: `1px solid ${palette.lineStrong}`, borderRadius: 999, padding: '6px 12px' }}>
                <Search size={14} strokeWidth={1.75} style={{ flex: 'none', color: palette.inkFaint }} />
                <input
                  value={notionQuery}
                  onChange={e => setNotionQuery(e.target.value)}
                  placeholder={notions.length === 0 ? t('editor.noNotions') : t('inline.notionSearch')}
                  disabled={notions.length === 0}
                  style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 12.5, color: palette.ink, background: 'transparent', border: 'none', outline: 'none' }}
                />
              </div>
              {notionQuery.trim() !== '' && notionMatches.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, maxHeight: 200, overflow: 'auto', background: palette.surfaceRaised, border: `1px solid ${palette.lineStrong}`, borderRadius: 12, boxShadow: `0 8px 24px ${ink(0.10)}`, padding: 5 }}>
                  {notionMatches.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => { toggleNotion(n.id); setNotionQuery(''); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12.5, color: palette.ink, background: 'transparent', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {n.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {draft.notionIds.map(nid => {
              const n = notions.find(nn => nn.id === nid);
              if (!n) return null;
              return (
                <div key={nid} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: 240, background: palette.tanTint, border: `1px solid ${palette.line}`, borderRadius: 999, padding: '4px 6px 4px 14px' }}>
                  <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 12.5, fontWeight: 600, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                  <button
                    type="button"
                    onClick={cycleBloom}
                    title={t('editor.bloomLabel')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: palette.green, background: withAlpha(palette.green, 0.14), border: 'none', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {t(`bloom.${draft.bloomLevel}`)}
                    <ChevronDown size={10} strokeWidth={2.2} style={{ opacity: 0.65 }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleNotion(nid)}
                    title={t('inline.removeNotion')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flex: 'none', border: 'none', background: 'transparent', color: palette.inkFaint, borderRadius: 999, cursor: 'pointer' }}
                  >
                    <X size={12} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>

          <span style={{ marginTop: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: palette.inkFaint }}>
            {t('inline.labelsTitle').toUpperCase()}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {creatingPool ? (
              <div style={{ display: 'flex', gap: 6, width: 300, maxWidth: '100%' }}>
                <div style={{ flex: 1 }}>
                  <TextField value={newPoolName} onChange={setNewPoolName} placeholder={t('editor.labelNamePlaceholder')} />
                </div>
                <button type="button" onClick={addPool} style={{ fontSize: 12, padding: '0 14px', borderRadius: 9, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.paper, 0.7), color: palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit' }}>{t('add')}</button>
                <button type="button" onClick={() => { setCreatingPool(false); setNewPoolName(''); }} style={{ fontSize: 12, padding: '0 14px', borderRadius: 9, border: `1px solid ${ink(0.10)}`, background: 'transparent', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>{t('cancelLower')}</button>
              </div>
            ) : (
              <select
                value=""
                onChange={e => {
                  if (e.target.value === '__new__') setCreatingPool(true);
                  else if (e.target.value) togglePool(e.target.value);
                }}
                style={{ ...selectStyle, fontWeight: 500, fontSize: 12.5, color: palette.inkMuted, borderRadius: 999, padding: '6px 12px' }}
              >
                <option value="">{t('editor.addLabelOption')}</option>
                {pools.filter(p => !draft.pools.includes(p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__new__">{t('editor.newLabelOption')}</option>
              </select>
            )}
            {draft.pools.map(pid => {
              const p = pools.find(pp => pp.id === pid);
              if (!p) return null;
              return (
                <span key={pid} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '5px 10px', borderRadius: 999, border: `1px solid ${ink(0.10)}`, background: palette.ink, color: palette.parchment }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  {p.name}
                  <button type="button" onClick={() => togglePool(pid)} style={{ display: 'flex', border: 'none', background: 'none', color: palette.parchment, cursor: 'pointer', padding: 0, opacity: 0.7 }}>
                    <X size={11} strokeWidth={2.2} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* questions liées (les « parties » du modèle) */}
      {draft.parts.map((part, idx) => {
        const partChoiceBased = CHOICE_BASED.includes(part.responseType);
        const partHasAnswer = part.responseType !== 'sans_reponse' && !partChoiceBased;
        return (
          <div key={idx} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${ink(0.10)}`, background: withAlpha(palette.paper, 0.55) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: palette.inkMuted }}>{number + idx + 1}.</span>
              <button type="button" onClick={() => patch({ parts: draft.parts.filter((_, i) => i !== idx) })} style={{ display: 'flex', border: 'none', background: 'none', color: palette.danger, cursor: 'pointer', padding: 2 }}>
                <X size={14} strokeWidth={2.2} />
              </button>
            </div>
            <TextField value={part.content} onChange={v => patchPart(idx, { content: v })} placeholder={t('editor.partStatementPlaceholder')} multiline rows={2} />
            <div style={{ marginTop: 10 }}>
              <select
                value={part.responseType}
                onChange={e => {
                  const v = e.target.value as ResponseType;
                  patchPart(idx, { responseType: v, choices: CHOICE_BASED.includes(v) ? (part.choices.length ? part.choices : ['', '']) : part.choices, correctChoices: [] });
                }}
                style={selectStyle}
              >
                {RESPONSE_TYPE_ORDER.map(k => (
                  <option key={k} value={k} disabled={RESPONSE_TYPE_V2.includes(k)}>
                    {t(`responseType.${k}`)}{RESPONSE_TYPE_V2.includes(k) ? ' · V2' : ''}
                  </option>
                ))}
              </select>
            </div>
            {partChoiceBased && (
              <div style={{ marginTop: 10 }}>
                <ChoiceListEditor responseType={part.responseType} choices={part.choices} correctChoices={part.correctChoices} onChange={(choices, correctChoices) => patchPart(idx, { choices, correctChoices })} />
              </div>
            )}
            {partHasAnswer && !(part.responseType === 'textuelle' && part.answerOptional) && (
              <div style={{ marginTop: 10 }}>
                <FieldLabel>{t('editor.answerLabelDefault')}</FieldLabel>
                <TextField value={part.answer} onChange={v => patchPart(idx, { answer: v })} placeholder={t('editor.answerPlaceholder')} multiline rows={2} />
              </div>
            )}
          </div>
        );
      })}

      {/* pied : outils à gauche, décision à droite */}
      <div style={{ paddingTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(v => !v)}
          style={{
            ...footerBtn,
            border: `1px solid ${advancedOpen ? palette.greenSoft : palette.lineStrong}`,
            background: advancedOpen ? withAlpha(palette.green, 0.12) : 'transparent',
            color: advancedOpen ? palette.green : palette.inkMuted,
          }}
        >
          <SlidersHorizontal size={15} strokeWidth={1.75} />
          {t('inline.advanced')}
        </button>
        <button
          type="button"
          onClick={() => patch({ parts: [...draft.parts, emptyPart()] })}
          style={{ ...footerBtn, border: `1.5px dashed ${palette.lineStrong}`, background: 'transparent', color: palette.tanStrong }}
        >
          <Link2 size={15} strokeWidth={1.75} />
          {t('inline.addPart')}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ ...footerBtn, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(draft)}
            title={canSave ? undefined : t('inline.statementRequired')}
            style={{
              ...footerBtn,
              border: 'none',
              background: canSave ? palette.green : ink(0.12),
              color: canSave ? palette.onGreen : palette.inkFaint,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {t('inline.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Champ d'énoncé qui grandit tout seul : jamais de poignée de redimensionnement
 *  (`resize: none`), la hauteur suit le nombre de lignes réellement saisies.
 *  `field-sizing: content` ne couvre pas encore tous les navigateurs, d'où la
 *  mesure explicite sur `scrollHeight`. */
function AutoTextarea({ value, onChange, placeholder, minHeight, fontSize = 14, bold = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  /** Hauteur plancher, en px — sert à garantir un nombre de lignes minimum. */
  minHeight?: number; fontSize?: number; bold?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `height: auto` laisse le navigateur retomber sur `min-height`, donc
    // `scrollHeight` est déjà borné par le plancher : pas de `Math.max`.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize, fontWeight: bold ? 600 : 400,
        lineHeight: bold ? 1.4 : 1.7, color: palette.ink, background: palette.surfaceRaised,
        border: `1px solid ${palette.lineStrong}`, borderRadius: 8, padding: bold ? '8px 10px' : '10px 14px',
        outline: 'none', resize: 'none', overflow: 'hidden', minHeight,
      }}
    />
  );
}

/** Rangée de commandes d'un bloc de type : réglages à gauche, bouton d'attendus
 *  à droite. Définie au niveau module (et non dans le composant) : une fonction
 *  composant recréée à chaque rendu remonterait tout son sous-arbre. */
function ControlRow({ children, trailing }: { children?: React.ReactNode; trailing?: React.ReactNode }) {
  if (!children && !trailing) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>{children}</div>
      {trailing}
    </div>
  );
}

/** Pilule de réglage à bascule (réponse unique, ordre aléatoire, numéros,
 *  types de fichiers, calque de dessin) — un seul habillage pour toutes. */
function PillToggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600,
        padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
        border: `1px solid ${on ? palette.green : palette.lineStrong}`,
        background: on ? withAlpha(palette.green, 0.12) : palette.surfaceRaised,
        color: on ? palette.green : palette.inkMuted,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, flex: 'none', background: on ? palette.green : palette.lineStrong }} />
      {label}
    </button>
  );
}

/** Une paire du type « paire » : l'élément, le curseur de partage, la
 *  correspondance. Chaque champ grandit indépendamment (l'élément peut tenir
 *  sur trois lignes et sa correspondance sur une) ; c'est le centrage vertical
 *  de la rangée qui garde les deux alignés. */
function MatchPairRow({
  left, right, split, leftPlaceholder, rightPlaceholder, fieldStyle,
  onLeftChange, onRightChange, onSplitDrag, onRemove, removeTitle, splitTitle,
}: {
  left: string; right: string; split: number;
  leftPlaceholder: string; rightPlaceholder: string; fieldStyle: React.CSSProperties;
  onLeftChange: (v: string) => void; onRightChange: (v: string) => void;
  onSplitDrag: (e: React.MouseEvent) => void;
  onRemove?: () => void; removeTitle: string; splitTitle: string;
}) {
  const leftRef = useRef<HTMLTextAreaElement>(null);
  const rightRef = useRef<HTMLTextAreaElement>(null);
  // Sans tableau de dépendances : la hauteur dépend aussi de la LARGEUR, donc
  // du curseur de partage, pas seulement du texte saisi. On n'écrit que du
  // style (jamais de setState) — aucun risque de boucle de rendu.
  useLayoutEffect(() => {
    for (const el of [leftRef.current, rightRef.current]) {
      if (!el) continue;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  });
  const cell: React.CSSProperties = {
    ...fieldStyle, width: '100%', padding: '8px 11px', fontSize: 12.5, lineHeight: 1.35,
    fontFamily: 'inherit', resize: 'none', overflow: 'hidden', display: 'block',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <div style={{ flex: `${split} 1 0`, minWidth: 0 }}>
        <textarea ref={leftRef} rows={1} value={left} onChange={e => onLeftChange(e.target.value)} placeholder={leftPlaceholder} style={cell} />
      </div>
      <span
        onMouseDown={onSplitDrag}
        title={splitTitle}
        style={{ flex: 'none', width: 18, alignSelf: 'stretch', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      >
        <span style={{ alignSelf: 'stretch', borderLeft: `1.5px dashed ${palette.amber}` }} />
        <span style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 6, height: 22, borderRadius: 999, background: palette.tanTint, border: `1px solid ${palette.amber}` }} />
      </span>
      <div style={{ flex: `${1 - split} 1 0`, minWidth: 0 }}>
        <textarea ref={rightRef} rows={1} value={right} onChange={e => onRightChange(e.target.value)} placeholder={rightPlaceholder} style={{ ...cell, textAlign: 'right' }} />
      </div>
      {onRemove ? (
        <button type="button" onClick={onRemove} title={removeTitle} style={{ flex: 'none', width: 19, marginLeft: 6, border: 'none', background: 'transparent', color: palette.inkFaint, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={13} strokeWidth={2.2} />
        </button>
      ) : <span style={{ flex: 'none', width: 25 }} />}
    </div>
  );
}

/** Bouton de média (image, audio) — inactif tant que la V2 n'est pas là, mais
 *  présent pour que sa place dans la barre d'énoncé soit déjà lisible. */
function MediaButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title={title}
      style={{
        width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, borderRadius: 8,
        color: palette.inkFaint, cursor: 'not-allowed', opacity: 0.55,
      }}
    >
      {children}
    </button>
  );
}

/** Petit bouton carré à bascule du barème avancé (gain dégressif, éliminatoire,
 *  pénalité sur absence de réponse). */
function IconToggle({ active = false, activeTone = 'green', title, onClick, children }: {
  active?: boolean; activeTone?: 'green' | 'danger';
  title: string; onClick: () => void; children: React.ReactNode;
}) {
  const accent = activeTone === 'danger' ? palette.danger : palette.green;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 30, height: 30, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, cursor: 'pointer',
        background: active ? accent : palette.surfaceRaised,
        border: `1px solid ${active ? accent : palette.lineStrong}`,
        color: active ? palette.parchment : palette.inkMuted,
      }}
    >
      {children}
    </button>
  );
}
