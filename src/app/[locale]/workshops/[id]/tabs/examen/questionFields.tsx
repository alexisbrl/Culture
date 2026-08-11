'use client';

// Corps d'édition d'une question — la SEULE implémentation, utilisée aussi bien
// par la question principale que par ses questions liées (refonte du
// 11/08/2026, voir docs/changelog.md).
//
// Une question liée est une question standard privée des seuls éléments communs
// (image, audio, libellés) : elle a donc son énoncé, son type de réponse, ses
// réglages de type, son barème, ses attendus, ses notions et son niveau de
// Bloom, saisis avec exactement les mêmes champs. C'est la raison d'être de ce
// module : avant, l'éditeur en ligne réimplémentait un formulaire appauvri pour
// les questions liées (un `<select>` nu et un champ réponse), qui ne savait pas
// éditer les réglages des types liste/tableau/paires/fichier/dessin.
//
// Ce que le composant NE rend pas, parce que ça n'appartient pas à un énoncé
// mais à la grappe entière : les pièces jointes (passées en `media`, seule la
// question principale en reçoit) et les libellés d'examen (rendus par
// l'appelant, une seule fois).
//
// ⚠️ Module feuille du graphe d'imports : il ne doit jamais importer
// `../QuestionEditor` (qui, lui, l'importe) — même raison que
// `questionMedia.tsx`. Les briques de formulaire partagées (`TextField`,
// `ChoiceListEditor`) et les constantes de types de réponse vivent donc ici.

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Ban, ChevronDown, CircleMinus, Clock, File, Link2, Palette, Search, X,
} from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import {
  BLOOM_LEVELS, DEFAULT_BLOOM_LEVEL, DEFAULT_FILE_TYPES, FILE_TYPE_KEYS,
  MATCH_SPLIT_DEFAULT, MATCH_SPLIT_MAX, MATCH_SPLIT_MIN,
  type BloomLevel, type QuestionPart, type QuestionTypeOptions, type QuestionWeight, type ResponseType,
} from '@/lib/workshops/examTypes';
// Les icônes de types de réponse sont partagées avec la banque de questions.
import { RESPONSE_TYPE_ICONS as TYPE_ICONS } from './examShared';

// `qcs` est volontairement absent de l'ordre du menu : c'est la variante
// « réponse unique » de `qcm`, basculée par une pilule (voir `ResponseType`).
export const RESPONSE_TYPE_ORDER: ResponseType[] = [
  'qcm', 'textuelle', 'liste', 'tableau', 'matching', 'dessin', 'fichier', 'sans_reponse',
];

export const CHOICE_BASED: ResponseType[] = ['qcs', 'qcm', 'matching'];

// Plus aucun type n'est différé : les huit entrées du menu ont toutes leur bloc
// d'édition et leur espace de réponse sur la copie. La constante reste pour ne
// pas casser ses consommateurs et pour un futur type différé.
export const RESPONSE_TYPE_V2: ResponseType[] = [];

/** Une question liée naît vide, en « texte » comme une question neuve — pas en
 *  « sans réponse » : neuf fois sur dix on ajoute une question liée pour poser
 *  une sous-question qui appelle une réponse. */
export function emptyPart(): QuestionPart {
  return {
    id: crypto.randomUUID(),
    content: '', responseType: 'textuelle', answer: '', choices: [], correctChoices: [],
    shuffleChoices: false, textLines: 4, typeOptions: {}, expectations: '',
    bloomLevel: DEFAULT_BLOOM_LEVEL, notionIds: [],
  };
}

const DEFAULT_TABLE_ROWS = 2;
const DEFAULT_TABLE_COLS = 3;
const MAX_TABLE_COLS = 5;

// Le sous-ensemble de `Question` que ce composant sait éditer. `QuestionPart` le
// satisfait entièrement, `Question` aussi (avec des champs en plus) : c'est
// exactement ce qui permet une seule implémentation pour les deux.
export type QuestionFieldValues = {
  content: string;
  responseType: ResponseType;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  textLines?: number;
  typeOptions?: QuestionTypeOptions;
  expectations?: string;
  bloomLevel: BloomLevel;
  notionIds: string[];
};

type Props = {
  values: QuestionFieldValues;
  onChange: (patch: Partial<QuestionFieldValues>) => void;
  /** Numéro affiché devant l'énoncé (« 2. »), aligné sur le rendu de la copie. */
  number: number;
  /** Révèle les réglages secondaires à leur place naturelle (voir InlineQuestionEditor). */
  advancedOpen: boolean;
  notions: { id: string; title: string }[];
  /** Barème — il appartient à l'examen, pas à la question. Absent (éditeur du
   *  parcours, qui n'a pas de copie) : aucun barème n'est affiché. */
  weight?: QuestionWeight;
  onWeightChange?: (patch: Partial<QuestionWeight>) => void;
  /** Boutons de pièce jointe : seule la question principale en reçoit. */
  media?: React.ReactNode;
  /** Retrait de l'énoncé : seules les questions liées en ont un. */
  onRemove?: () => void;
  statementPlaceholder: string;
};

export function QuestionFields({
  values, onChange, number, advancedOpen, notions, weight, onWeightChange, media, onRemove, statementPlaceholder,
}: Props) {
  const t = useTranslations('examen');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [expectationsOpen, setExpectationsOpen] = useState(false);
  const [notionQuery, setNotionQuery] = useState('');
  /** Bloc des paires — sert de référentiel de largeur au curseur de partage. */
  const matchRowsRef = useRef<HTMLDivElement>(null);

  const rt = values.responseType;
  const isQcm = rt === 'qcm' || rt === 'qcs';
  const hasExpectations = (values.expectations ?? '').trim().length > 0;
  const opts = values.typeOptions ?? {};

  function patch(p: Partial<QuestionFieldValues>) {
    onChange(p);
  }
  function patchOptions(p: Partial<QuestionTypeOptions>) {
    onChange({ typeOptions: { ...(values.typeOptions ?? {}), ...p } });
  }
  function toggleNotion(id: string) {
    patch({ notionIds: values.notionIds.includes(id) ? values.notionIds.filter(n => n !== id) : [...values.notionIds, id] });
  }
  /** Un seul niveau de Bloom par énoncé dans le modèle : la pastille portée par
   *  chaque notion pilote donc le niveau de CET énoncé — question principale ou
   *  question liée, chacune a le sien (la maquette en prévoit un par notion —
   *  divergence assumée, voir docs/backlog.md). */
  function cycleBloom() {
    const i = BLOOM_LEVELS.indexOf(values.bloomLevel);
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
    const parts = values.choices.map(c => c.split(' :: '));
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
      : rt === 'tableau' ? items : values.choices;

    // Un seul `onChange` par changement de type : l'appelant applique le patch
    // sur son état, deux appels successifs partiraient tous les deux de la même
    // valeur de `values` et le second écraserait le premier.
    const nextOptions: QuestionTypeOptions = { ...(values.typeOptions ?? {}) };
    if (next === 'tableau') {
      // Les éléments deviennent les lignes, les correspondances les colonnes.
      // À défaut (aucun contenu à reprendre), on garde la grille déjà saisie —
      // sinon un aller-retour par un type sans saisie l'effacerait.
      const filled = (arr: string[]) => arr.some(v => v.trim() !== '');
      const rows = filled(items) ? padRows(items, DEFAULT_TABLE_ROWS) : (opts.tableRows?.length ? opts.tableRows : padRows([], DEFAULT_TABLE_ROWS));
      const cols = filled(matches) ? matches : (opts.tableCols?.length ? opts.tableCols : padRows([], DEFAULT_TABLE_COLS));
      const sameGrid = JSON.stringify(rows) === JSON.stringify(opts.tableRows ?? []) && JSON.stringify(cols) === JSON.stringify(opts.tableCols ?? []);
      nextOptions.tableRows = rows;
      nextOptions.tableCols = cols;
      nextOptions.tableChecked = sameGrid ? (opts.tableChecked ?? []) : [];
    }
    if (next === 'liste') nextOptions.listExpected = Math.min(opts.listExpected ?? nextChoices.length, nextChoices.length);
    if (next === 'fichier' && !opts.fileTypes) nextOptions.fileTypes = DEFAULT_FILE_TYPES;

    patch({ responseType: next, choices: nextChoices, correctChoices: [], typeOptions: nextOptions });
  }

  const selectStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: palette.ink, border: `1px solid ${palette.lineStrong}`,
    borderRadius: 10, padding: '8px 12px', background: palette.surfaceRaised, outline: 'none',
    fontFamily: 'inherit', cursor: 'pointer',
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
    !values.notionIds.includes(n.id) && n.title.toLowerCase().includes(notionQuery.trim().toLowerCase()),
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
              choices={values.choices}
              correctChoices={values.correctChoices}
              onChange={(choices, correctChoices) => patch({ choices, correctChoices })}
              hideAddButton
            />
            <ControlRow trailing={attendusButton}>
              <button type="button" onClick={() => patch({ choices: [...values.choices, ''] })} style={addLink}>
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
                  on={values.shuffleChoices}
                  onClick={() => patch({ shuffleChoices: !values.shuffleChoices })}
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
              value={values.answer}
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
                  value={values.textLines ?? 3}
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
        const items = values.choices.length ? values.choices : ['', '', ''];
        const numbered = opts.listNumbered ?? true;
        const expected = opts.listExpected ?? items.length;
        // Le nombre de réponses attendues suit l'ajout/retrait de lignes, borné
        // par [1, nombre de lignes] : on ne peut pas en attendre plus qu'il n'y
        // a de références saisies.
        const commit = (arr: string[], expectedDelta: number) => {
          const next = Math.min(Math.max(expected + expectedDelta, 1), arr.length);
          patch({ choices: arr, typeOptions: { ...(values.typeOptions ?? {}), listExpected: next } });
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
        const pairs = (values.choices.length ? values.choices : ['', '', '']).map(c => {
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

      // Dessin / fichier / vide : rien à corriger automatiquement, le bloc
      // montre à quoi ressemblera l'espace de réponse de l'élève.
      // Le réglage « basé sur l'image de la question » ne vit pas ici mais
      // juste sous le sélecteur de type (voir plus bas) : le laisser au-dessus
      // du cadre de dessin creusait un vide dans la carte.
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
    <>
      {/* énoncé + médias (question principale) ou retrait (question liée) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flex: 'none', fontSize: 14, fontWeight: 600, color: palette.ink, paddingTop: 10 }}>{number}.</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AutoTextarea value={values.content} onChange={v => patch({ content: v })} placeholder={statementPlaceholder} />
        </div>
        {media}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title={t('inline.removeLinked')}
            style={{
              flex: 'none', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 9, border: `1px solid ${palette.lineStrong}`, background: 'transparent',
              color: palette.inkFaint, cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
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
        {weight && onWeightChange && (
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
        )}
      </div>

      {renderTypeBlock()}

      {/* attendus : instructions de correction libres, repliées par défaut */}
      {advancedOpen && expectationsOpen && (
        <textarea
          value={values.expectations ?? ''}
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

      {/* notions couvertes par CET énoncé (la question principale et chaque
          question liée ont les leurs, avec leur propre niveau de Bloom) */}
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
            {values.notionIds.map(nid => {
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
                    {t(`bloom.${values.bloomLevel}`)}
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
        </div>
      )}
    </>
  );
}

// ─── Briques de formulaire partagées ─────────────────────────────────────────

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

/** Champ d'énoncé qui grandit tout seul : jamais de poignée de redimensionnement
 *  (`resize: none`), la hauteur suit le nombre de lignes réellement saisies.
 *  `field-sizing: content` ne couvre pas encore tous les navigateurs, d'où la
 *  mesure explicite sur `scrollHeight`. */
export function AutoTextarea({ value, onChange, placeholder, minHeight, fontSize = 14, bold = true }: {
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
export function PillToggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title?: string }) {
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
