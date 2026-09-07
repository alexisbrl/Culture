'use client';

// Banque de questions de l'onglet examen. Depuis le 19/08/2026, la liste
// elle-même vit dans `QuestionListView`, partagée avec les questions du parcours
// pédagogique : recherche, tri, panneau de filtres et cartes y sont écrits une
// seule fois. Ce fichier ne fait plus que dire ce que la banque a **en plus** —
// ses libellés et ses examens — et à quoi les brancher.

import { type ReactNode } from 'react';
import { type Question } from '../QuestionEditor';
import { type Pool, type Exam } from './examShared';
import QuestionListView, { type EditorSlotOptions } from './QuestionListView';

function BankContent({ workshopId, questions, loading, pools, exams, notions, chapters, draftIds, renderEditor, editingQuestionId, editingIsNew, openId, setOpenId, onEditQuestion, onNewQuestion, onCancelNewQuestion, draftStatement, onToggleInExam, onCreatePool, onUpdatePool, onDeletePool, onDeleteQuestion }: {
  workshopId: string;
  questions: Question[];
  /** Les questions ne sont pas encore arrivées du serveur — voir `loading` de
   *  `QuestionListView`, qui en tire l'encadré d'attente et l'extinction de la
   *  création. */
  loading: boolean;
  pools: Pool[];
  exams: Exam[];
  notions: { id: string; title: string; chapterId: string | null }[];
  chapters: { id: string; name: string }[];
  draftIds: string[];
  /** Le formulaire de question, rendu dans la liste (06/09/2026) — comme côté
   *  parcours. Il vivait sur la feuille A4 : la copie ne montrait alors plus la
   *  question qu'on modifiait, et l'ouvrir depuis la banque l'ajoutait d'office
   *  à l'examen en cours.
   *  Facultatif : sur téléphone, quand la copie est affichée, c'est ELLE qui
   *  porte le formulaire (la liste n'est pas visible), et l'appelant ne le passe
   *  alors pas — deux instances voudraient dire deux brouillons pour une seule
   *  question. */
  renderEditor?: (options?: EditorSlotOptions) => ReactNode;
  editingQuestionId: string | null;
  /** La question ouverte vient d'être créée — voir `editingIsNew` de
   *  `QuestionListView`. */
  editingIsNew: boolean;
  /** Abandonne la création en cours (bascule vers l'IA). */
  onCancelNewQuestion: () => void;
  /** L'énoncé en cours de frappe, que la bascule emporte vers la consigne. */
  draftStatement: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEditQuestion: (q: Question) => void;
  onNewQuestion: (initialStatement?: string) => void;
  onToggleInExam: (id: string) => void;
  onCreatePool: (name: string) => string;
  onUpdatePool: (pool: Pool) => void;
  onDeletePool: (id: string) => void;
  onDeleteQuestion: (q: Question) => void;
}) {
  return (
    <QuestionListView
      workshopId={workshopId}
      aiContext="exam"
      questions={questions}
      loading={loading}
      notions={notions}
      chapters={chapters}
      labels={{ pools, onCreate: onCreatePool, onUpdate: onUpdatePool, onDelete: onDeletePool }}
      exams={{ list: exams, draftIds, onToggleInExam }}
      renderEditor={renderEditor}
      editOnDoubleClick
      editingQuestionId={editingQuestionId}
      editingIsNew={editingIsNew}
      openId={openId}
      setOpenId={setOpenId}
      onEditQuestion={onEditQuestion}
      onNewQuestion={onNewQuestion}
      onCancelNewQuestion={onCancelNewQuestion}
      draftStatement={draftStatement}
      onDeleteQuestion={onDeleteQuestion}
    />
  );
}

export default BankContent;
