'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, FileText, Search, X } from 'lucide-react';
import { palette, ink, radius, shadow, withAlpha } from '@/lib/theme';
import QuestionEditor, { type Question, emptyQuestion } from './QuestionEditor';
import {
  getExamBankData, saveQuestion, createPool as createPoolAction, updatePool as updatePoolAction,
  deletePool as deletePoolAction, deleteQuestion as deleteQuestionAction, saveGeneratedExam,
  deleteGeneratedExam, getExamDraft, saveExamDraft,
} from '@/app/actions/examQuestions';
import {
  type Exam, type Pool, type ExamConfig,
  defaultExamConfig, normalizeExamConfig, configQuestionIds, formatDuration, clearWeightingFor,
} from './examen/examShared';
import HistoryContent from './examen/HistoryContent';
import BankContent from './examen/BankContent';
import GeneratorContent from './examen/GeneratorContent';

// Onglet actif de la colonne gauche — « generator » (la feuille A4) n'est plus
// un onglet : c'est une colonne à part, toujours visible (variante retenue
// « banqueOngletsLarge », voir docs/design/README.md et T34 de la feuille de route).
type LeftTab = 'history' | 'bank';

// génération d'id unique au niveau module (hors composant) — évite l'appel impur Date.now() dans le render
function newExamId() { return 'e' + Date.now(); }

// ---- MAIN EXAMEN TAB ----
export default function ExamenTab({ workshopId }: { workshopId: string }) {
  const t = useTranslations('examen');
  const [leftTab, setLeftTab] = useState<LeftTab>('bank');
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [notions, setNotions] = useState<{ id: string; title: string }[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [pendingDeleteExam, setPendingDeleteExam] = useState<Exam | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig>(defaultExamConfig());
  const [pendingEditExam, setPendingEditExam] = useState<Exam | null>(null);
  const [openQuestionBlocked, setOpenQuestionBlocked] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);

  function isEditorEmpty() {
    return editing === null && draftIds.length === 0 && examConfig.title.trim() === '' && configQuestionIds(examConfig).length === 0;
  }

  function requestEditExam(e: Exam) {
    if (editing?.id === e.id || isEditorEmpty()) {
      setEditing(e);
      setDraftIds(e.questionIds ?? []);
      setExamConfig(e.config?.sections ? normalizeExamConfig(e.config) : defaultExamConfig(e.title));
      focus('generator');
    } else {
      setPendingEditExam(e);
    }
  }

  const draftLoaded = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getExamBankData(workshopId), getExamDraft(workshopId)]).then(([{ questions, pools, exams, notions }, draft]) => {
      const mappedExams = exams.map(e => ({ id: e.id, title: e.title, date: e.date, q: e.q, dur: e.dur, avg: e.avg, status: e.status, taken: e.taken, questionIds: e.questionIds, config: e.config }));
      setQuestions(questions);
      setPools(pools);
      setNotions(notions);
      setExams(mappedExams);
      if (draft) {
        setDraftIds(draft.draftIds);
        setExamConfig(draft.config?.sections ? normalizeExamConfig(draft.config) : defaultExamConfig());
        if (draft.editingId) {
          const found = mappedExams.find(e => e.id === draft.editingId);
          if (found) setEditing(found);
        }
      }
    }).catch(err => console.error('chargement banque de questions échoué', err))
      .finally(() => { draftLoaded.current = true; });
  }, [workshopId]);

  // sauvegarde du brouillon de l'éditeur d'examen (reprise après reconnexion / le lendemain)
  useEffect(() => {
    if (!draftLoaded.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveExamDraft(workshopId, { draftIds, config: examConfig, editingId: editing?.id ?? null }).catch(err => console.error('sauvegarde du brouillon échouée', err));
    }, 800);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [workshopId, draftIds, examConfig, editing]);

  function handleClearEditor() {
    setEditing(null);
    setDraftIds([]);
    setExamConfig(defaultExamConfig());
  }

  // Amène un onglet au premier plan de la colonne gauche. « generator » (la
  // feuille A4) n'est plus un onglet dans la coquille retenue — elle est déjà
  // toujours visible dans la colonne de droite, donc no-op. Signature conservée
  // pour ne pas toucher les appelants (`requestEditExam`, `handleGenerate`…).
  function focus(id: LeftTab | 'generator') {
    if (id === 'generator') return;
    setLeftTab(id);
  }

  function handleGenerate() {
    const id = newExamId();
    const title = examConfig.title;
    const questionIds = configQuestionIds(examConfig);
    const dur = formatDuration(examConfig.durationMinutes);
    const saved: Exam = editing
      ? { ...editing, title, date: "aujourd'hui", q: questionIds.length, dur, questionIds, config: examConfig }
      : { id, title, date: "aujourd'hui", q: questionIds.length, dur, avg: '—', status: 'brouillon', taken: 0, questionIds, config: examConfig };
    setExams(prev => {
      if (editing) {
        const rest = prev.filter(e => e.id !== editing.id);
        return [saved, ...rest];
      }
      return [saved, ...prev];
    });
    const hotId = editing ? editing.id : id;
    setJustAdded(hotId);
    setEditing(null);
    setDraftIds([]);
    setExamConfig(defaultExamConfig());
    focus('history');
    setTimeout(() => setJustAdded(cur => cur === hotId ? null : cur), 2600);
    saveGeneratedExam(workshopId, saved).catch(err => console.error('enregistrement examen échoué', err));
  }

  function handleDeleteExam(exam: Exam) {
    setExams(prev => prev.filter(e => e.id !== exam.id));
    setPendingDeleteExam(null);
    if (editing?.id === exam.id) {
      setEditing(null);
      setDraftIds([]);
      setExamConfig(defaultExamConfig());
    }
    deleteGeneratedExam(workshopId, exam.id).catch(err => console.error('suppression de l\'examen échouée', err));
  }

  function handleOpenQuestion(id: string) {
    const q = questions.find(p => p.id === id);
    if (!q) return;
    if (editingQuestion && editingQuestion.id !== id) {
      setOpenQuestionBlocked(true);
      setTimeout(() => setOpenQuestionBlocked(false), 2200);
      return;
    }
    setEditingQuestion(q);
    focus('bank');
  }

  function handleSaveQuestion(q: Question) {
    setQuestions(prev => {
      const exists = prev.some(p => p.id === q.id);
      if (exists) return prev.map(p => (p.id === q.id ? q : p));
      const withCreatedAt = q.createdAt ? q : { ...q, createdAt: new Date().toISOString() };
      return [withCreatedAt, ...prev];
    });
    setEditingQuestion(null);
    saveQuestion(workshopId, q).catch(err => console.error('enregistrement question échoué', err));
  }

  function handleDuplicateQuestion(q: Question) {
    const copy: Question = { ...q, id: 'q' + Date.now() + Math.random().toString(36).slice(2, 7), examIds: [] };
    setQuestions(prev => [copy, ...prev]);
    saveQuestion(workshopId, copy).catch(err => console.error('duplication de la question échouée', err));
  }

  function handleDeleteQuestion(deleted: Question) {
    const id = deleted.id;

    setQuestions(prev => prev.filter(q => q.id !== id));

    // retrait des sections d'examens générés qui référencent la question
    const updatedExams: Exam[] = [];
    setExams(prev => prev.map(e => {
      if (!e.config) return e;
      if (!e.config.sections.some(sec => sec.questionIds.includes(id))) return e;
      const sections = e.config.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) }));
      const weighting = clearWeightingFor(e.config.weighting, id);
      const config = { ...e.config, sections, weighting };
      const questionIds = configQuestionIds(config);
      const next = { ...e, config, questionIds, q: questionIds.length };
      updatedExams.push(next);
      return next;
    }));
    updatedExams.forEach(next => saveGeneratedExam(workshopId, next).catch(err => console.error('mise à jour de l\'examen échouée', err)));

    // retrait de l'éditeur d'examen en cours
    setDraftIds(prev => prev.filter(qid => qid !== id));
    setExamConfig(prev => {
      if (!prev.sections.some(sec => sec.questionIds.includes(id))) return prev;
      const sections = prev.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) }));
      const weighting = clearWeightingFor(prev.weighting, id);
      return { ...prev, sections, weighting };
    });

    deleteQuestionAction(workshopId, id, []).catch(err => console.error('suppression de la question échouée', err));
  }

  function handleCreatePool(name: string): string {
    const id = 'pool' + Date.now();
    const pool = { id, name, color: '#9eb3b9' };
    setPools(prev => [...prev, pool]);
    createPoolAction(workshopId, pool).catch(err => console.error('création libellé échouée', err));
    return id;
  }

  function handleUpdatePool(pool: Pool) {
    setPools(prev => prev.map(p => p.id === pool.id ? pool : p));
    updatePoolAction(workshopId, pool).catch(err => console.error('modification du libellé échouée', err));
  }

  function handleDeletePool(id: string) {
    setPools(prev => prev.filter(p => p.id !== id));
    const affected = questions.filter(q => q.pools.includes(id)).map(q => ({ ...q, pools: q.pools.filter(p => p !== id) }));
    setQuestions(prev => prev.map(q => q.pools.includes(id) ? { ...q, pools: q.pools.filter(p => p !== id) } : q));
    deletePoolAction(workshopId, id, affected).catch(err => console.error('suppression libellé échouée', err));
  }

  function handleSendOne(id: string) {
    setDraftIds(prev => prev.includes(id) ? prev : [id, ...prev]);
  }

  function handleRemoveFromDraft(ids: string[]) {
    setDraftIds(prev => prev.filter(id => !ids.includes(id)));
  }

  const tabButtonStyle = (active: boolean, corner: 'left' | 'right'): React.CSSProperties => ({
    flex: 1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    color: active ? palette.greenBrand : palette.inkMuted,
    background: active ? withAlpha(palette.green, 0.12) : 'transparent',
    border: 'none',
    borderBottom: `2px solid ${active ? palette.green : 'transparent'}`,
    borderTopLeftRadius: corner === 'left' ? radius.lg : 0,
    borderTopRightRadius: corner === 'right' ? radius.lg : 0,
    padding: '13px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Coquille côte à côte (« banqueOngletsLarge ») : colonne gauche à onglets
          pleine largeur (mes examens / questions) à 360px fixes, feuille A4
          toujours visible à droite (flex:1) — empilées en dessous de 768px. */}
      <div className="flex flex-col md:flex-row" style={{ flex: 1, minHeight: 0, gap: 20, margin: '22px 22px 20px', overflow: 'auto' }}>
        <div className="w-full md:w-[360px]" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          <div style={{ display: 'flex', flexShrink: 0, border: `1px solid ${palette.lineStrong}`, borderBottom: 'none', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden' }}>
            <button onClick={() => setLeftTab('history')} style={tabButtonStyle(leftTab === 'history', 'left')}>
              <FileText size={15} strokeWidth={1.75} />
              {t('tab.tabHistory')}
            </button>
            <button onClick={() => setLeftTab('bank')} style={tabButtonStyle(leftTab === 'bank', 'right')}>
              <Search size={15} strokeWidth={1.75} />
              {t('tab.tabBank')}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', border: `1px solid ${palette.lineStrong}`, borderRadius: `0 0 ${radius.lg}px ${radius.lg}px`, background: palette.surfaceRaised, boxShadow: shadow.sm, overflow: 'hidden' }}>
            {/* Montage permanent des deux onglets (display none/block) — préserve
                la recherche/le tri en cours quand on bascule d'onglet, comme le
                fait déjà SettingsClient pour ses sections. */}
            <div style={{ display: leftTab === 'history' ? 'block' : 'none', height: '100%', overflowY: 'auto' }}>
              <HistoryContent exams={exams} justAddedId={justAdded} onEdit={requestEditExam} onNew={() => setIntroOpen(true)} onDelete={e => setPendingDeleteExam(e)} />
            </div>
            <div style={{ display: leftTab === 'bank' ? 'block' : 'none', height: '100%', overflowY: 'auto', position: 'relative' }}>
              <BankContent
                questions={questions}
                pools={pools}
                exams={exams}
                draftIds={draftIds}
                openId={openId}
                setOpenId={setOpenId}
                onEditQuestion={q => setEditingQuestion(q)}
                onNewQuestion={() => setEditingQuestion(emptyQuestion())}
                onSendOne={handleSendOne}
                onCreatePool={handleCreatePool}
                onUpdatePool={handleUpdatePool}
                onDeletePool={handleDeletePool}
                onDuplicateQuestion={handleDuplicateQuestion}
                onDeleteQuestion={handleDeleteQuestion}
              />
              {editingQuestion && (
                <QuestionEditor
                  question={editingQuestion}
                  allQuestions={questions}
                  pools={pools}
                  notions={notions}
                  onCreatePool={handleCreatePool}
                  onSave={handleSaveQuestion}
                  onCancel={() => setEditingQuestion(null)}
                />
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: 420, display: 'flex', flexDirection: 'column', border: `1px solid ${palette.line}`, borderRadius: radius.lg, background: palette.surfaceRaised, boxShadow: shadow.sm, overflow: 'hidden' }}>
          <GeneratorContent questions={questions} draftIds={draftIds} config={examConfig} onConfigChange={setExamConfig} editing={editing} onCancelEdit={() => setEditing(null)} onGenerate={handleGenerate} onOpenQuestion={handleOpenQuestion} onRemoveFromDraft={handleRemoveFromDraft} onClearEditor={handleClearEditor} />
        </div>
      </div>
      {pendingDeleteExam && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setPendingDeleteExam(null)} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: palette.cream, borderRadius: 20, padding: '32px 28px 24px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: withAlpha(palette.danger, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>!</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: palette.ink }}>{t('tab.deleteExamTitle')}</div>
            <div style={{ fontSize: 13, color: palette.inkMuted, lineHeight: 1.5 }}>
              <strong style={{ color: palette.ink }}>{pendingDeleteExam.title}</strong>
              <br />{t('irreversible')}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
              <button onClick={() => setPendingDeleteExam(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${ink(0.15)}`, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: palette.inkMuted, cursor: 'pointer' }}>{t('cancel')}</button>
              <button onClick={() => pendingDeleteExam && handleDeleteExam(pendingDeleteExam)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: palette.danger, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: palette.paper, cursor: 'pointer' }}>{t('delete')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {pendingEditExam && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setPendingEditExam(null)} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: palette.cream, borderRadius: 20, padding: '32px 28px 24px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: withAlpha(palette.danger, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>!</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: palette.ink }}>{t('tab.editorBusyTitle')}</div>
            <div style={{ fontSize: 13, color: palette.inkMuted, lineHeight: 1.5 }}>
              {t('tab.editorBusyDesc', { target: pendingEditExam.title })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
              <button onClick={() => setPendingEditExam(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${ink(0.15)}`, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: palette.inkMuted, cursor: 'pointer' }}>{t('cancel')}</button>
              <button onClick={() => { setPendingEditExam(null); focus('generator'); }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: palette.green, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: palette.paper, cursor: 'pointer' }}>{t('tab.editorBusyGo')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {openQuestionBlocked && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: palette.ink, color: palette.parchment, fontFamily: 'var(--font-sans)', fontSize: 12.5, boxShadow: `0 12px 32px ${ink(0.30)}` }}>
          <AlertTriangle size={14} strokeWidth={2} color={palette.amberGlow} />
          {t('tab.questionEditing')}
        </div>,
        document.body
      )}
      {introOpen && (() => {
        const steps = [
          { title: t('tab.introStep1Title'), text: t('tab.introStep1Text'), side: 'left' as const },
          { title: t('tab.introStep2Title'), text: t('tab.introStep2Text'), side: 'right' as const },
          { title: t('tab.introStep3Title'), text: t('tab.introStep3Text'), side: 'left' as const },
        ];
        // bandes verticales (% de la hauteur totale de la popup) : en-tête, 3 lignes égales, pied de page
        const HEADER_PCT = 16;
        const FOOTER_PCT = 13;
        const ROW_PCT = (100 - HEADER_PCT - FOOTER_PCT) / steps.length;
        return createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setIntroOpen(false)} style={{ position: 'absolute', inset: 0, background: ink(0.46), backdropFilter: 'blur(3px)' }} />
            <div style={{ position: 'relative', height: '90vh', width: 'calc(90vh * 0.75)', maxWidth: '92vw' }}>
              {/* carte : fond, texte, bouton — clippée pour les coins arrondis */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden', background: 'linear-gradient(160deg, #fdf9ef 0%, #f6ead2 100%)', boxShadow: `0 28px 70px ${ink(0.32)}` }}>
                <button onClick={() => setIntroOpen(false)} title={t('tab.introClose')} style={{ position: 'absolute', top: 18, right: 18, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', border: `1px solid ${ink(0.12)}`, background: palette.paper, color: palette.ink, cursor: 'pointer' }}>
                  <X size={17} strokeWidth={2} />
                </button>

                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${HEADER_PCT}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 70px', textAlign: 'center' }}>
                  <div style={{ fontSize: 23, fontWeight: 600, color: palette.ink }}>{t('tab.introTitle')}</div>
                  <div style={{ fontSize: 13.5, color: '#8a7f64', marginTop: 8 }}>{t('tab.introSubtitle')}</div>
                </div>

                {steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: `${HEADER_PCT + ROW_PCT * i}%`,
                      height: `${ROW_PCT}%`,
                      left: step.side === 'left' ? '46%' : '6%',
                      right: step.side === 'left' ? '6%' : '46%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#7a4d20', marginBottom: 8 }}>{step.title}</div>
                    <div style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.65 }}>{step.text}</div>
                  </div>
                ))}

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${FOOTER_PCT}%`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 32px', borderTop: `1px solid ${ink(0.08)}` }}>
                  <button
                    onClick={() => { setIntroOpen(false); setEditing(null); setExamConfig(defaultExamConfig()); focus('bank'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 10, border: 'none', background: palette.green, color: palette.paper, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t('tab.introStart')}
                    <ArrowRight size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* images : par-dessus la carte, non clippées — débordent du cadre pour l'effet « pop-out » */}
              {steps.map((step, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: `${HEADER_PCT + ROW_PCT * (i + 0.5)}%`,
                    transform: `translateY(-50%) rotate(${step.side === 'left' ? -4 : 4}deg)`,
                    left: step.side === 'left' ? -64 : undefined,
                    right: step.side === 'left' ? undefined : -64,
                    width: 260,
                    height: 230,
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '46% 54% 58% 42% / 50% 46% 54% 50%',
                    background: 'radial-gradient(circle at 32% 28%, #f2cf8e 0%, #dba85a 55%, #c98f43 100%)',
                    boxShadow: `0 20px 46px ${withAlpha(palette.amber, 0.38)}`,
                  }} />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(122,77,32,0.55)',
                    textAlign: 'center',
                  }}>
                    {t('tab.introImage', { n: i + 1 })}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
