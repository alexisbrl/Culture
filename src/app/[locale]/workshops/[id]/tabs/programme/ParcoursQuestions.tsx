'use client';

// Vue de gestion des questions du parcours pédagogique, ouverte depuis le
// bouton en haut de l'onglet Programme. Réservée aux gestionnaires.
//
// Les questions vivent dans la même table que la banque d'examen
// (`exam_questions`), distinguées par `context = 'parcours'` — d'où la
// réutilisation directe de `QuestionEditor` plutôt qu'un second éditeur.
// Chargement à l'ouverture (et non côté serveur avec la page) : un candidat ne
// doit jamais recevoir ces données, qui contiennent les réponses.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { Chapter } from '@/app/actions/workshopChapters';
import QuestionEditor, { type Question, emptyQuestion } from '../QuestionEditor';
import {
  getParcoursQuestions,
  saveParcoursQuestion,
  deleteParcoursQuestion,
  createParcoursPool,
} from '@/app/actions/parcoursQuestions';

type Pool = { id: string; name: string; color: string };

export default function ParcoursQuestions({ workshopId, chapters, onBack }: { workshopId: string; chapters: Chapter[]; onBack: () => void }) {
  const t = useTranslations('programme');
  const tExam = useTranslations('examen');

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  // Le chapitre s'affecte depuis la liste, pas depuis l'éditeur (partagé avec
  // la banque d'examen, qui ignore les chapitres). Cet état ne pilote donc
  // aucun champ : il mémorise le chapitre de la question en cours d'édition
  // pour le réinjecter à la sauvegarde, que QuestionEditor perdrait sinon.
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  useEffect(() => {
    let cancelled = false;
    getParcoursQuestions(workshopId)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
        setPools(data.pools);
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
    setEditingChapterId(q.chapterId ?? null);
    setError('');
  }

  async function handleSave(q: Question) {
    // QuestionEditor ne connaît pas le chapitre : on le réinjecte à la sortie.
    const question: Question = { ...q, chapterId: editingChapterId };
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

  // Affectation à un chapitre depuis la liste : mise à jour optimiste puis
  // enregistrement, avec retour à l'état précédent si ça échoue. Pas de bouton
  // « enregistrer » — c'est un champ unique, l'aller-retour serveur est court.
  async function handleChapterChange(question: Question, chapterId: string | null) {
    const previous = question.chapterId ?? null;
    const updated: Question = { ...question, chapterId };
    setQuestions((prev) => prev.map((x) => (x.id === question.id ? updated : x)));
    setError('');

    const result = await saveParcoursQuestion(workshopId, updated);
    if (!result.success) {
      setQuestions((prev) => prev.map((x) => (x.id === question.id ? { ...x, chapterId: previous } : x)));
      setError(result.error ?? t('questions.saveError'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setError('');
    const result = await deleteParcoursQuestion(workshopId, target.id);
    if (!result.success) {
      setError(result.error ?? t('questions.deleteError'));
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== target.id));
    if (editing?.id === target.id) setEditing(null);
  }

  // QuestionEditor attend un identifiant de pool en retour synchrone : on crée
  // le pool localement puis on l'enregistre, en annulant l'ajout si ça échoue.
  function handleCreatePool(name: string): string {
    const pool: Pool = { id: 'p' + Date.now(), name, color: '#9a948a' };
    setPools((prev) => [...prev, pool]);
    createParcoursPool(workshopId, pool).then((result) => {
      if (!result.success) {
        setPools((prev) => prev.filter((p) => p.id !== pool.id));
        setError(result.error ?? t('questions.saveError'));
      }
    });
    return pool.id;
  }

  if (editing) {
    return (
      <div style={{ padding: '18px 22px 22px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        {error && <div style={{ fontSize: 12.5, color: palette.danger, marginBottom: 10 }}>{error}</div>}
        <QuestionEditor
          question={editing}
          allQuestions={questions}
          pools={pools}
          onCreatePool={handleCreatePool}
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
    <div style={{ padding: '18px 22px 22px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: palette.inkMuted, padding: 0 }}
        >
          <ArrowLeft size={14} /> {t('questions.back')}
        </button>
        <button
          onClick={() => openEditor(emptyQuestion())}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: palette.ink, border: '1px solid #2d2a24', color: palette.paper, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Plus size={13} /> {t('questions.new')}
        </button>
      </div>

      <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink }}>{t('questions.title')}</div>
      <div style={{ fontSize: 12.5, color: palette.inkFaint, marginBottom: 4 }}>{t('questions.desc')}</div>
      <div style={{ fontSize: 12.5, color: palette.inkFaint, marginBottom: 12 }}>{t('questions.noChapterHint')}</div>

      {error && <div style={{ fontSize: 12.5, color: palette.danger, marginBottom: 10 }}>{error}</div>}

      <div style={{ background: withAlpha(palette.paper, 0.85), borderRadius: 14, border: `1px solid ${ink(0.07)}`, padding: '6px 18px' }}>
        {loading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: palette.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('questions.loading')}
          </div>
        ) : questions.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: palette.inkFaint }}>{t('questions.empty')}</div>
        ) : (
          questions.map((q, i) => (
            <div
              key={q.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < questions.length - 1 ? `1px solid ${ink(0.06)}` : 'none' }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#b8b1a6', fontFamily: 'ui-monospace, monospace', width: 24, flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.content.trim() || tExam('noStatement')}
                </div>
                <div style={{ fontSize: 11, color: palette.inkFaint, marginTop: 2 }}>
                  {tExam(`responseType.${q.responseType}`)}
                </div>
              </div>
              {/* Chapitre de rattachement : c'est lui qui détermine dans quel
                  pot la question peut être tirée. Sans chapitre, jamais tirée. */}
              <select
                value={q.chapterId ?? ''}
                onChange={(e) => handleChapterChange(q, e.target.value || null)}
                title={t('questions.chapter')}
                style={{ flexShrink: 0, maxWidth: 190, padding: '7px 10px', borderRadius: 9, border: `1px solid ${q.chapterId ? ink(0.16) : withAlpha(palette.danger, 0.35)}`, background: palette.paper, color: q.chapterId ? palette.ink : palette.inkFaint, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <option value="">{t('questions.noChapter')}</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => openEditor(q)}
                style={{ padding: '7px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('questions.edit')}
              </button>
              <button
                onClick={() => setDeleteTarget(q)}
                style={{ padding: '7px 14px', borderRadius: 9, background: withAlpha(palette.danger, 0.10), border: `1px solid ${withAlpha(palette.danger, 0.30)}`, color: palette.danger, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('questions.delete')}
              </button>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={t('questions.deleteTitle')}
          description={tExam('irreversible')}
          confirmLabel={t('questions.delete')}
          cancelLabel={tExam('cancel')}
          portal
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
