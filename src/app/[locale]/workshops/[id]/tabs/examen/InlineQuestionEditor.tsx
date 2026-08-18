'use client';

// Édition d'une question DIRECTEMENT sur la feuille d'examen (maquette
// `App-Culture.dc.html`, bloc `sq.isEditing`, lignes 1047-1168, et blocs par
// type `_typeVisual`, lignes 3034-3229). Remplace le popup `QuestionEditor`
// pour tout le flux examen : créer, modifier, retirer.
//
// Le popup subsiste ailleurs — l'onglet Parcours l'utilise aussi et n'a pas de
// feuille sur laquelle éditer. Le corps du formulaire (énoncé, type de réponse,
// bloc d'édition du type, barème, attendus, notions) vit dans
// `questionFields.tsx` et sert aux deux éditeurs comme aux questions liées :
// une seule implémentation des règles de saisie.
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
// ─── Questions liées ─────────────────────────────────────────────────────────
// Une question liée est une question standard privée des seuls éléments
// communs — image, audio et libellés, saisis une fois pour toute la grappe.
// Elle a donc le même formulaire que la question principale (même énoncé, même
// menu de types, mêmes réglages, même barème, mêmes attendus, mêmes notions et
// son propre niveau de Bloom), séparée par un simple filet : aucun encadré, pour
// que la feuille se lise comme la suite d'énoncés qu'elle est. Modèle :
// `QuestionPart` dans @/lib/workshops/examTypes.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AudioLines, ImageIcon, Link2, SlidersHorizontal } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import {
  DEFAULT_BLOOM_LEVEL, type Question, type QuestionPart, type QuestionWeight,
} from '@/lib/workshops/examTypes';
import { QuestionFields, emptyPart } from './questionFields';
import { MediaAttachment, useQuestionMediaDrop } from './questionMedia';
import { type Pool, LabelPill, LabelEditor, LabelPicker } from './examShared';
import { Tooltip } from '@/components/ui/tooltip';

type Props = {
  workshopId: string;
  question: Question;
  /** Numéro affiché sur la copie (« 2. »), pour rester aligné sur le rendu figé.
   *  Omis côté parcours : hors feuille, une question n'a pas de rang. */
  number?: number;
  /** Vrai si la question vient d'être créée : le libellé et l'annulation changent. */
  isNew: boolean;
  /** Libellés de l'atelier. Le bloc entier est masqué côté parcours
   *  (`showLabels={false}`) : ce sont les étiquettes de la banque d'EXAMEN, les
   *  voir ici prêterait à confusion, et le parcours n'en a pas besoin — c'est
   *  le chapitre qui y range les questions. */
  pools?: { id: string; name: string; color: string }[];
  showLabels?: boolean;
  notions: { id: string; title: string }[];
  /** Pondération de la question — elle appartient à l'examen, pas à la question. */
  /** Barème — il appartient à l'EXAMEN, pas à la question. Absent côté parcours,
   *  qui n'a pas de copie : `QuestionFields` n'affiche alors aucun barème (le
   *  socle partagé le prévoit déjà). */
  weight?: QuestionWeight;
  onWeightChange?: (patch: Partial<QuestionWeight>) => void;
  /** Cadre du bloc. `sheet` : posé sur la feuille A4, teinté et cerné de vert
   *  pour se détacher du rendu figé des autres questions. `plain` : hors feuille
   *  (parcours), où il n'y a rien dont se détacher — un simple cadre neutre. */
  frame?: 'sheet' | 'plain';
  /** Pondération d'une question liée. Lue par index et non passée en tableau :
   *  l'éditeur peut en ajouter au brouillon avant enregistrement, donc réclamer
   *  un index que l'examen ne connaît pas encore (l'appelant retombe alors sur
   *  le barème par défaut). */
  partWeight?: (idx: number) => QuestionWeight;
  onPartWeightChange?: (idx: number, patch: Partial<QuestionWeight>) => void;
  /** Retrait d'une question liée : l'appelant décale les pondérations suivantes
   *  (elles sont indexées par position, voir `partWeightKey`). */
  onRemovePart?: (idx: number) => void;
  onCreatePool?: (name: string) => string;
  /** Modification/suppression d'un libellé depuis l'éditeur — même panneau et
   *  mêmes conséquences que depuis les filtres de la banque (`LabelEditor`).
   *  Optionnels : sans eux, les libellés restent attachables mais non éditables
   *  (la suppression a besoin de connaître TOUTES les questions portant le
   *  libellé, les deux contextes confondus — voir ParcoursQuestions). */
  onUpdatePool?: (pool: Pool) => void;
  onDeletePool?: (id: string) => void;
  /** Nombre de questions portant un libellé, pour la confirmation de suppression
   *  (seul l'appelant connaît la banque complète). */
  poolUsageCount?: (poolId: string) => number;
  onSave: (q: Question) => void;
  onCancel: () => void;
};

export default function InlineQuestionEditor({
  workshopId, question, number, isNew, notions, weight, onWeightChange,
  partWeight, onPartWeightChange, onRemovePart, onCreatePool, onUpdatePool,
  onDeletePool, poolUsageCount, onSave, onCancel, frame = 'sheet',
  pools = [], showLabels = true,
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
  const [editingPool, setEditingPool] = useState<string | null>(null);

  // Glisser-déposer un fichier n'importe où sur la carte : reconnu comme
  // image ou audio et rangé au bon endroit (voir questionMedia.tsx).
  const { dragOver, dropError, dropHandlers } = useQuestionMediaDrop(workshopId, (kind, media) => patch({ [kind]: media }));

  const canSave = draft.content.trim().length > 0;

  function patch(p: Partial<Question>) {
    setDraft(d => ({ ...d, ...p }));
  }
  function patchPart(idx: number, p: Partial<QuestionPart>) {
    setDraft(d => ({ ...d, parts: d.parts.map((pt, i) => (i === idx ? { ...pt, ...p } : pt)) }));
  }
  function removePart(idx: number) {
    setDraft(d => ({ ...d, parts: d.parts.filter((_, i) => i !== idx) }));
    // Côté examen, l'appelant décale les pondérations suivantes. Côté parcours
    // il n'y a pas de barème, donc rien à décaler.
    onRemovePart?.(idx);
  }
  function togglePool(id: string) {
    patch({ pools: draft.pools.includes(id) ? draft.pools.filter(p => p !== id) : [...draft.pools, id] });
  }
  function addPool(name: string) {
    // `onCreatePool` n'est fourni que là où les libellés sont affichés : ce
    // chemin est injoignable côté parcours, la garde n'est là que pour le typage.
    if (!onCreatePool) return;
    patch({ pools: [...draft.pools, onCreatePool(name)] });
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

  return (
    <div
      {...dropHandlers}
      style={{
        margin: frame === 'sheet' ? '10px 26px' : 0, padding: '14px 16px', borderRadius: 14,
        border: dragOver
          ? `1.5px dashed ${palette.green}`
          : `1px solid ${frame === 'sheet' ? palette.greenSoft : palette.line}`,
        background: dragOver
          ? withAlpha(palette.green, 0.12)
          : frame === 'sheet' ? withAlpha(palette.green, 0.06) : palette.surfaceRaised,
        display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box', minWidth: 0,
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: palette.green }}>
        {(isNew ? t('inline.newQuestion') : t('inline.editQuestion')).toUpperCase()} · {t(`responseType.${draft.responseType}`).toUpperCase()}
      </div>
      {dropError && <div style={{ fontSize: 12, color: palette.danger }}>{dropError}</div>}

      <QuestionFields
        values={draft}
        onChange={p => patch(p as Partial<Question>)}
        number={number}
        advancedOpen={advancedOpen}
        notions={notions}
        weight={weight}
        onWeightChange={onWeightChange}
        hasImage={!!draft.image}
        statementPlaceholder={t('inline.statementPlaceholder')}
        media={
          <>
            <MediaAttachment
              workshopId={workshopId}
              kind="image"
              media={draft.image}
              onChange={(image) => patch({ image })}
              label={t('inline.attachImage')}
              icon={<ImageIcon size={18} strokeWidth={1.75} />}
            />
            {/* L'audio ne s'affiche qu'en mode avancé, comme dans la maquette. */}
            {advancedOpen && (
              <MediaAttachment
                workshopId={workshopId}
                kind="audio"
                media={draft.audio}
                onChange={(audio) => patch({ audio })}
                label={t('inline.attachAudio')}
                icon={<AudioLines size={18} strokeWidth={1.75} />}
              />
            )}
          </>
        }
      />

      {/* questions liées — mêmes champs, séparées par un simple filet */}
      {draft.parts.map((part, idx) => (
        <div
          key={idx}
          style={{
            paddingTop: 14, borderTop: `1px solid ${ink(0.10)}`,
            display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
          }}
        >
          <QuestionFields
            values={part}
            onChange={p => patchPart(idx, p as Partial<QuestionPart>)}
            // Les questions liées comptent comme des questions à part entière
            // dans la numérotation de la copie : la principale porte `number`,
            // la première liée `number + 1`, etc. Sans numérotation (parcours),
            // les liées n'en reçoivent pas non plus — surtout pas `NaN`.
            number={number === undefined ? undefined : number + idx + 1}
            advancedOpen={advancedOpen}
            notions={notions}
            // Sans barème (parcours), les questions liées n'en affichent pas
            // non plus : `QuestionFields` masque le bloc quand `weight` manque.
            weight={partWeight?.(idx)}
            onWeightChange={onPartWeightChange ? (p) => onPartWeightChange(idx, p) : undefined}
            // L'image appartient à la grappe : une question liée peut donc, elle
            // aussi, demander une réponse posée dessus.
            hasImage={!!draft.image}
            onRemove={() => removePart(idx)}
            statementPlaceholder={t('inline.linkedStatementPlaceholder')}
          />
        </div>
      ))}

      {/* libellés : communs à la question et à toutes ses questions liées.
          Masqués côté parcours — voir le prop `showLabels`. */}
      {showLabels && advancedOpen && (
        /* `position: relative` : `LabelEditor` se centre sur cet ancêtre. */
        <div style={{ position: 'relative', paddingTop: 14, borderTop: `1px solid ${ink(0.10)}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: palette.inkFaint }}>
            {t('inline.labelsTitle').toUpperCase()}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {/* Choisir, modifier et créer un libellé se font tous les trois dans
                le panneau du menu — voir `LabelPicker`. */}
            <LabelPicker
              pools={pools}
              selected={draft.pools}
              onToggle={togglePool}
              onCreate={onCreatePool ? addPool : undefined}
              onEdit={onUpdatePool ? setEditingPool : undefined}
              wrapperStyle={{ display: 'inline-flex' }}
              triggerStyle={{ ...selectStyle, fontWeight: 500, fontSize: 12.5, color: palette.inkMuted, borderRadius: 999, padding: '6px 12px' }}
            >
              {t('editor.addLabelOption')}
            </LabelPicker>
            {draft.pools.map(pid => {
              const p = pools.find(pp => pp.id === pid);
              if (!p) return null;
              return (
                <LabelPill
                  key={pid}
                  name={p.name}
                  color={p.color}
                  size="md"
                  // Pas de crayon quand l'appelant ne sait pas éditer un libellé
                  // (parcours) : un bouton qui n'aboutit à rien vaut moins que
                  // pas de bouton.
                  onEdit={onUpdatePool ? () => setEditingPool(pid) : undefined}
                  editTitle={t('bank.editLabelTitle')}
                  onRemove={() => togglePool(pid)}
                  removeTitle={t('inline.removeLabel')}
                />
              );
            })}
          </div>
          {editingPool && onUpdatePool && onDeletePool && (() => {
            const p = pools.find(pp => pp.id === editingPool);
            if (!p) return null;
            return (
              <LabelEditor
                label={p}
                usageCount={poolUsageCount?.(p.id) ?? 0}
                onSave={onUpdatePool}
                // Le libellé disparaît de l'atelier : le retirer aussi du
                // brouillon en cours, sinon la question serait enregistrée avec
                // une référence morte.
                onDelete={() => { onDeletePool(p.id); patch({ pools: draft.pools.filter(x => x !== p.id) }); }}
                onClose={() => setEditingPool(null)}
              />
            );
          })()}
        </div>
      )}

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
          {/* Enveloppe indispensable : un `<button disabled>` n'émet aucun
              événement de souris, l'infobulle ne s'ouvrirait donc jamais posée
              sur lui — or c'est précisément désactivé qu'il a quelque chose à
              expliquer. C'est le `span` qui reçoit le survol. */}
          <Tooltip content={canSave ? undefined : t('inline.statementRequired')}>
          <span style={{ display: 'inline-flex' }}>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(draft)}
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
          </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
