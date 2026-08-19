'use client';

// Banque de questions de l'onglet examen. Depuis le 19/08/2026, la liste
// elle-même vit dans `QuestionListView`, partagée avec les questions du parcours
// pédagogique : recherche, tri, panneau de filtres et cartes y sont écrits une
// seule fois. Ce fichier ne fait plus que dire ce que la banque a **en plus** —
// ses libellés et ses examens — et à quoi les brancher.

import { type Question } from '../QuestionEditor';
import { type Pool, type Exam } from './examShared';
import QuestionListView from './QuestionListView';

function BankContent({ questions, pools, exams, notions, chapters, draftIds, editingQuestionId, openId, setOpenId, onEditQuestion, onNewQuestion, onToggleInExam, onCreatePool, onUpdatePool, onDeletePool, onDeleteQuestion }: {
  questions: Question[];
  pools: Pool[];
  exams: Exam[];
  notions: { id: string; title: string; chapterId: string | null }[];
  chapters: { id: string; name: string }[];
  draftIds: string[];
  editingQuestionId: string | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEditQuestion: (q: Question) => void;
  onNewQuestion: () => void;
  onToggleInExam: (id: string) => void;
  onCreatePool: (name: string) => string;
  onUpdatePool: (pool: Pool) => void;
  onDeletePool: (id: string) => void;
  onDeleteQuestion: (q: Question) => void;
}) {
  return (
    <QuestionListView
      questions={questions}
      notions={notions}
      chapters={chapters}
      labels={{ pools, onCreate: onCreatePool, onUpdate: onUpdatePool, onDelete: onDeletePool }}
      exams={{ list: exams, draftIds, onToggleInExam }}
      editingQuestionId={editingQuestionId}
      openId={openId}
      setOpenId={setOpenId}
      onEditQuestion={onEditQuestion}
      onNewQuestion={onNewQuestion}
      onDeleteQuestion={onDeleteQuestion}
    />
  );
}

export default BankContent;
