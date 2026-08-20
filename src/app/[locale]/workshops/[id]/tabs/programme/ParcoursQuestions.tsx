'use client';

// Vue de gestion des questions du parcours pédagogique, ouverte depuis le
// bouton en haut de l'onglet Programme. Réservée aux gestionnaires.
//
// Les questions vivent dans la même table que la banque d'examen
// (`exam_questions`), distinguées par `context = 'parcours'` — d'où la
// réutilisation directe de `QuestionEditor` plutôt qu'un second éditeur.
// Chargement à l'ouverture (et non côté serveur avec la page) : un candidat ne
// doit jamais recevoir ces données, qui contiennent les réponses.
//
// La LISTE est celle de la banque d'examen (`QuestionListView`, 19/08/2026) :
// même barre d'outils, mêmes filtres, mêmes cartes. Deux différences, portées
// par les props optionnelles du composant : pas de libellés (ce sont les
// étiquettes de la banque) et pas d'examens (une question de parcours
// n'appartient à aucun examen).
//
// Deux ajouts propres au parcours, eux aussi optionnels côté liste :
//   - l'éditeur s'ouvre DANS la liste, à la place de la carte (`renderEditor`),
//     là où la banque le pose dans sa feuille ;
//   - un double-clic sur une carte l'ouvre. Raccourci seulement : le crayon
//     fait la même chose et reste le geste découvrable. Il n'entre en conflit
//     avec rien ici, une carte de parcours n'ayant pas d'action au clic simple
//     (côté banque, le clic pose la question sur la feuille).

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { palette } from '@/lib/theme';
import type { Chapter } from '@/app/actions/workshopChapters';
// Le parcours utilise le MÊME éditeur que la banque d'examen. Il exposait
// auparavant un second éditeur en popup (`QuestionEditor`), qui avait dérivé :
// il éditait encore un titre, une difficulté et une durée que le stockage
// n'enregistre plus (voir `rowToQuestion`), présentait les notions comme une
// propriété du groupe alors qu'elles appartiennent à chaque question, et
// n'offrait aucun réglage pour les types liste/tableau/paire/fichier/dessin.
// Une seule implémentation : une correction profite désormais aux deux côtés.
import { type Question, emptyQuestion } from '../QuestionEditor';
import InlineQuestionEditor from '../examen/InlineQuestionEditor';
import QuestionListView from '../examen/QuestionListView';
import { LIST_INSET_X } from '../examen/examShared';
import {
  getParcoursQuestions,
  saveParcoursQuestion,
  deleteParcoursQuestion,
} from '@/app/actions/parcoursQuestions';

export default function ParcoursQuestions({ workshopId, chapters, onBack }: { workshopId: string; chapters: Chapter[]; onBack: () => void }) {
  const t = useTranslations('programme');

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Pas d'état de libellés : ils ne sont pas affichés côté parcours (ce sont
  // les étiquettes de la banque d'examen — voir `showLabels` sur l'éditeur).
  // `chapterId` accompagne chaque notion : c'est de là que la liste tire le
  // chapitre d'une question, comme la banque.
  const [notions, setNotions] = useState<{ id: string; title: string; chapterId: string | null }[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  // Grappe dépliée dans la liste (chevron de la carte).
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getParcoursQuestions(workshopId)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
        setNotions(data.notions);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('questions.loadError'));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId, t]);

  function openEditor(q: Question) {
    setEditing(q);
    setError('');
  }

  async function handleSave(question: Question) {
    setSaving(true);
    setError('');
    const result = await saveParcoursQuestion(workshopId, question);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? t('questions.saveError'));
      return;
    }
    setQuestions((prev) => {
      const exists = prev.some((x) => x.id === question.id);
      return exists ? prev.map((x) => (x.id === question.id ? question : x)) : [...prev, question];
    });
    setEditing(null);
  }

  // La confirmation est portée par la liste (`QuestionListView`) : ici, on ne
  // reçoit que la décision prise.
  async function handleDelete(target: Question) {
    setError('');
    const result = await deleteParcoursQuestion(workshopId, target.id);
    if (!result.success) {
      setError(result.error ?? t('questions.deleteError'));
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== target.id));
    if (editing?.id === target.id) setEditing(null);
  }

  // Rendu par la liste, à la place de la carte de la question éditée — ou tout
  // en haut si cette carte n'y est pas (question nouvelle, ou écartée par les
  // filtres actifs). Voir `renderEditor` dans `QuestionListView`.
  function editeur() {
    if (!editing) return null;
    return (
      <div>
        {/* MÊME éditeur que la banque d'examen — voir la note d'import. Les
            props omis sont ceux qui n'ont pas de sens ici : le barème
            (`weight`) appartient à l'examen, et l'édition d'un libellé demande
            de connaître les questions des DEUX contextes. */}
        {/* `key` sur l'identifiant : passer d'une question à l'autre (ou à une
            nouvelle) sans quitter la liste garde l'éditeur au MÊME endroit de
            l'arbre, et React réutiliserait alors son état — le brouillon de la
            question précédente restait affiché sous le titre de la suivante. */}
        <InlineQuestionEditor
          key={editing.id}
          workshopId={workshopId}
          question={editing}
          isNew={!questions.some((q) => q.id === editing.id)}
          frame="plain"
          showLabels={false}
          notions={notions}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
        {saving && (
          <div style={{ fontSize: 12, color: palette.inkSoft, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {t('questions.saving')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Coquille centrée, à la largeur de la page paramètres (1100 =
          navigation + colonne de droite, `.settings-shell`) : sur grand écran,
          des cartes de question étalées sur toute la fenêtre donnent des lignes
          d'énoncé interminables et un vide immense entre le texte et ses deux
          boutons, à l'autre bout. */}
      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
      {/* En-tête propre au parcours. Le retrait horizontal est celui de la
          liste (`LIST_INSET_X`), pour que titre et cartes s'alignent. */}
      <div style={{ padding: `18px ${LIST_INSET_X}px 0` }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: palette.inkMuted, padding: 0, marginBottom: 14 }}
        >
          <ArrowLeft size={14} /> {t('questions.back')}
        </button>

        <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink }}>{t('questions.title')}</div>
        <div style={{ fontSize: 12.5, color: palette.inkFaint, marginBottom: 4 }}>{t('questions.desc')}</div>
        <div style={{ fontSize: 12.5, color: palette.inkFaint }}>{t('questions.noChapterHint')}</div>

        {error && <div style={{ fontSize: 12.5, color: palette.danger, marginTop: 10 }}>{error}</div>}
      </div>

      {loading ? (
        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12.5, color: palette.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('questions.loading')}
        </div>
      ) : (
        // Ni `labels` ni `exams` : le parcours n'a ni étiquettes ni examens, et
        // leur absence retire les sections correspondantes au lieu de les
        // désactiver (voir `QuestionListView`).
        <QuestionListView
          workshopId={workshopId}
          aiContext="parcours"
          questions={questions}
          notions={notions}
          chapters={chapters}
          renderEditor={editeur}
          editOnDoubleClick
          editingQuestionId={editing?.id ?? null}
          openId={openId}
          setOpenId={setOpenId}
          onEditQuestion={openEditor}
          onNewQuestion={() => openEditor(emptyQuestion())}
          onDeleteQuestion={handleDelete}
        />
      )}
      </div>
    </div>
  );
}
