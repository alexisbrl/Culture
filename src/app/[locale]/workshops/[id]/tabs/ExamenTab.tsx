'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
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

// ré-exporté pour les server actions (examQuestions.ts) qui importent ce type depuis ce module
export type { ExamConfig } from './examen/examShared';

// ---- PANEL TITLES ----
const IDS = ['history', 'bank', 'generator'] as const;
type PanelId = typeof IDS[number];

// génération d'id unique au niveau module (hors composant) — évite l'appel impur Date.now() dans le render
function newExamId() { return 'e' + Date.now(); }

// ---- MAIN EXAMEN TAB ----
export default function ExamenTab({ workshopId }: { workshopId: string }) {
  const t = useTranslations('examen');
  const panelTitle = (id: PanelId): string => id === 'history' ? t('tab.panelHistory') : id === 'bank' ? t('tab.panelBank') : t('tab.panelGenerator');
  const stageRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevRects = useRef<Record<string, { l: number; t: number; w: number; h: number }>>({});
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [order, setOrder] = useState<PanelId[]>(['history', 'bank', 'generator']);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
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

  const GAP = 16;
  const SIDE_W = 320;
  // sous cette largeur, les 3 panneaux passent d'une mise en page côte-à-côte (avec mise à l'échelle)
  // à une pile verticale plein-largeur (échelle 1:1, scroll vertical) — reflow façon Gmail au zoom navigateur.
  const STACK_BP = 860;
  const draftLoaded = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getExamBankData(workshopId), getExamDraft(workshopId)]).then(([{ questions, pools, exams }, draft]) => {
      const mappedExams = exams.map(e => ({ id: e.id, title: e.title, date: e.date, q: e.q, dur: e.dur, avg: e.avg, status: e.status, taken: e.taken, questionIds: e.questionIds, config: e.config }));
      setQuestions(questions);
      setPools(pools);
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

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w > 0 && h > 0) {
        setDim(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
      }
    };
    // mesure en continu (et pas seulement au premier rendu) : un changement de zoom navigateur modifie
    // la largeur en px CSS disponible et doit donc redéclencher le calcul de mise en page/reflow.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    IDS.forEach(id => {
      const el = tileRefs.current[id];
      if (!el) return;
      const nr = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      const pr = prevRects.current[id];
      prevRects.current[id] = nr;
      if (!pr || !nr.w || !nr.h) return;
      const dx = pr.l - nr.l, dy = pr.t - nr.t;
      const sx = pr.w / nr.w, sy = pr.h / nr.h;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.004 && Math.abs(sy - 1) < 0.004) return;
      if (typeof el.animate !== 'function') return;
      el.animate([
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: 'top left', transform: 'translate(0px, 0px) scale(1, 1)' },
      ], { duration: 480, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
    });
  });

  function focus(id: PanelId) {
    setOrder(prev => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const n = [...prev];
      const tmp = n[0]; n[0] = n[i]; n[i] = tmp;
      return n;
    });
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

  function rectFor(role: number) {
    const { w, h } = dim;
    if (w < STACK_BP) {
      // pile verticale plein-largeur : chaque panneau occupe toute la largeur disponible (s=1, pas de
      // mise à l'échelle) ; le panneau focus (role 0) est plus grand, les 2 autres défilent en dessous.
      const mainH = 620;
      const sideH = 400;
      const y = role === 0 ? 0 : role === 1 ? mainH + GAP : mainH + GAP + sideH + GAP;
      return { x: 0, y, w, h: role === 0 ? mainH : sideH, main: role === 0 };
    }
    const mainW = Math.max(360, w - SIDE_W - GAP);
    const sideH = (h - GAP) / 2;
    if (role === 0) return { x: 0, y: 0, w: mainW, h, main: true };
    if (role === 1) return { x: mainW + GAP, y: 0, w: SIDE_W, h: sideH, main: false };
    return { x: mainW + GAP, y: sideH + GAP, w: SIDE_W, h: sideH, main: false };
  }

  const stacked = dim.w < STACK_BP;
  const mainW = stacked ? dim.w : Math.max(360, dim.w - SIDE_W - GAP);
  const ready = dim.w > 0 && dim.h > 0;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes examPop { 0% { background: rgba(232,184,108,0.42); } 100% { } }`}</style>
      <div ref={stageRef} style={{ flex: 1, position: 'relative', margin: '22px 22px 20px', minHeight: 0, overflow: stacked ? 'auto' : 'visible', paddingBottom: stacked ? 50 : 0 }}>
        {ready && IDS.map(id => {
          const role = order.indexOf(id);
          const r = rectFor(role);
          const s = r.w / mainW;
          // historique/banque défilent via ce conteneur (l'éditeur gère son propre scroll interne) : on
          // réserve une petite marge à droite pour décoller la scrollbar de la bordure de la tuile, comme
          // c'est déjà le cas pour l'éditeur d'examen.
          const contentW = id === 'generator' ? mainW : mainW - 16;
          return (
            <div key={id} ref={el => { tileRefs.current[id] = el; }} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 16, overflow: 'hidden', border: r.main ? '1px solid rgba(45,42,36,0.10)' : `1px solid ${ink(0.08)}`, background: id === 'generator' ? palette.creamAlt : palette.cream, boxShadow: r.main ? '0 16px 44px rgba(45,42,36,0.10)' : `0 6px 18px ${ink(0.08)}`, zIndex: r.main ? 2 : 1 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: contentW, height: r.h / s, transform: `scale(${s})`, transformOrigin: '0 0', overflowY: id === 'generator' ? 'hidden' : 'auto', overflowX: 'hidden', background: id === 'generator' ? palette.creamAlt : palette.cream }}>
                {id === 'history' && <HistoryContent exams={exams} justAddedId={justAdded} onEdit={requestEditExam} onNew={() => setIntroOpen(true)} onDelete={e => setPendingDeleteExam(e)} />}
                {id === 'bank' && (
                  <BankContent
                    questions={questions}
                    pools={pools}
                    exams={exams}
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
                )}
                {id === 'generator' && <GeneratorContent questions={questions} draftIds={draftIds} config={examConfig} onConfigChange={setExamConfig} editing={editing} onCancelEdit={() => setEditing(null)} onGenerate={handleGenerate} onOpenQuestion={handleOpenQuestion} onRemoveFromDraft={handleRemoveFromDraft} onClearEditor={handleClearEditor} />}
              </div>
              {id === 'bank' && editingQuestion && (
                <>
                  <QuestionEditor
                    question={editingQuestion}
                    allQuestions={questions}
                    pools={pools}
                    onCreatePool={handleCreatePool}
                    onSave={handleSaveQuestion}
                    onCancel={() => setEditingQuestion(null)}
                  />
                  {!r.main && (
                    <div onClick={() => focus(id)} style={{ position: 'absolute', inset: 0, zIndex: 61, cursor: 'pointer' }} />
                  )}
                </>
              )}
              {!r.main && (
                <>
                  <div onClick={() => focus(id)} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer', background: 'linear-gradient(180deg, rgba(252,249,242,0.96), rgba(252,249,242,0.0))' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: palette.amber, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: palette.ink }}>{panelTitle(id)}</span>
                  </div>
                  <div onClick={() => focus(id)} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ink(0.0), transition: 'background 180ms ease', cursor: 'pointer' }}>
                    <button onClick={e => { e.stopPropagation(); focus(id); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: withAlpha(palette.paper, 0.96), color: palette.ink, fontSize: 12.5, fontWeight: 500, boxShadow: `0 6px 18px ${ink(0.20)}`, opacity: 0, pointerEvents: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5.5 1.5H1.5V5.5M8.5 12.5h4V8.5M1.5 8.5v4h4M12.5 5.5v-4h-4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {t('expand')}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
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
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: palette.ink, color: palette.parchment, fontFamily: "'Inter Tight', system-ui, sans-serif", fontSize: 12.5, boxShadow: `0 12px 32px ${ink(0.30)}` }}>
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
