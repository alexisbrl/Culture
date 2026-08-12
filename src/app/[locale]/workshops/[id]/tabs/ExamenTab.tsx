'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, FileText, Search, X } from 'lucide-react';
import { palette, ink, radius, withAlpha, categoryTones } from '@/lib/theme';
import { type Question, emptyQuestion } from './QuestionEditor';
import {
  getExamBankData, saveQuestion, createPool as createPoolAction, updatePool as updatePoolAction,
  deletePool as deletePoolAction, deleteQuestion as deleteQuestionAction, saveGeneratedExam,
  deleteGeneratedExam, getExamDraft, saveExamDraft,
} from '@/app/actions/examQuestions';
import {
  type Exam, type Pool, type ExamConfig, type SheetFocus,
  defaultExamConfig, normalizeExamConfig, configQuestionIds, formatDuration, clearWeightingFor,
  toggleQuestionInSections, isPageBreakId, pruneUnknownQuestions,
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
  // `chapterId` sur la notion + la liste des chapitres : de quoi filtrer la
  // banque par chapitre, qu'une question ne porte pas elle-même (elle en hérite
  // par ses notions associées).
  const [notions, setNotions] = useState<{ id: string; title: string; chapterId: string | null }[]>([]);
  const [chapters, setChapters] = useState<{ id: string; name: string }[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [pendingDeleteExam, setPendingDeleteExam] = useState<Exam | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [newQuestionId, setNewQuestionId] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig>(defaultExamConfig());
  const [pendingEditExam, setPendingEditExam] = useState<Exam | null>(null);
  const [openQuestionBlocked, setOpenQuestionBlocked] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  // Ligne de la feuille à ramener au centre du panneau de droite. Tout ce qui
  // ajoute ou ouvre quelque chose sur la copie passe par là : la question
  // envoyée depuis la banque, le formulaire en ligne, « + partie » et « + saut
  // de page » (ces deux-là depuis la feuille, via `onRequestFocus`). Le jeton
  // rejoue le recadrage quand la même ligne est visée deux fois de suite.
  const [sheetFocus, setSheetFocus] = useState<SheetFocus | null>(null);

  function requestSheetFocus(key: string) {
    setSheetFocus(prev => ({ key, token: (prev?.token ?? 0) + 1 }));
  }

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
    Promise.all([getExamBankData(workshopId), getExamDraft(workshopId)]).then(([{ questions, pools, exams, notions, chapters }, draft]) => {
      const mappedExams = exams.map(e => ({ id: e.id, title: e.title, date: e.date, q: e.q, dur: e.dur, avg: e.avg, status: e.status, taken: e.taken, questionIds: e.questionIds, config: e.config }));
      setQuestions(questions);
      setPools(pools);
      setNotions(notions);
      setChapters(chapters);
      setExams(mappedExams);
      if (draft) {
        // Filet : un brouillon peut référencer une question qui n'existe plus
        // (supprimée ailleurs, ou création abandonnée par une fermeture d'onglet
        // avant enregistrement). Ces identifiants ne s'affichent nulle part mais
        // compteraient dans le barème — on les écarte à la lecture.
        const known = new Set(questions.map(q => q.id));
        const keep = (id: string) => isPageBreakId(id) || known.has(id);
        setDraftIds(draft.draftIds.filter(keep));
        setExamConfig(draft.config?.sections ? pruneUnknownQuestions(normalizeExamConfig(draft.config), keep) : defaultExamConfig());
        if (draft.editingId) {
          const found = mappedExams.find(e => e.id === draft.editingId);
          if (found) setEditing(found);
        }
      }
    }).catch(err => console.error('chargement banque de questions échoué', err))
      .finally(() => { draftLoaded.current = true; });
  }, [workshopId]);

  // Sauvegarde du brouillon de l'éditeur d'examen (reprise après reconnexion /
  // le lendemain). Une question en cours de création n'existe qu'en mémoire tant
  // qu'elle n'est pas enregistrée : la persister ici laisserait un identifiant
  // fantôme dans l'examen, invisible sur la feuille mais compté dans le barème.
  useEffect(() => {
    if (!draftLoaded.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    const pendingId = newQuestionId;
    const keep = (id: string) => id !== pendingId;
    const config = pendingId ? pruneUnknownQuestions(examConfig, keep) : examConfig;
    const ids = pendingId ? draftIds.filter(keep) : draftIds;
    draftSaveTimer.current = setTimeout(() => {
      saveExamDraft(workshopId, { draftIds: ids, config, editingId: editing?.id ?? null }).catch(err => console.error('sauvegarde du brouillon échouée', err));
    }, 800);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [workshopId, draftIds, examConfig, editing, newQuestionId]);

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

  // Ouvre le formulaire en ligne sur la feuille. Une seule question à la fois :
  // deux formulaires ouverts, ce serait deux brouillons concurrents pour un même
  // examen. Rappuyer sur le bouton de la question déjà ouverte referme le
  // formulaire — même effet que son bouton « annuler ».
  function handleOpenQuestion(id: string) {
    const q = questions.find(p => p.id === id);
    if (!q) return;
    if (editingQuestion) {
      if (editingQuestion.id === id) { handleCancelQuestion(); return; }
      setOpenQuestionBlocked(true);
      setTimeout(() => setOpenQuestionBlocked(false), 2200);
      return;
    }
    setEditingQuestion(q);
    requestSheetFocus(id);
  }

  // Crayon de la banque : l'édition se fait sur la feuille, donc une question qui
  // n'est pas encore dans l'examen l'y rejoint (fin de la dernière partie).
  function requestEditQuestion(q: Question) {
    if (editingQuestion) {
      if (editingQuestion.id === q.id) { handleCancelQuestion(); return; }
      setOpenQuestionBlocked(true);
      setTimeout(() => setOpenQuestionBlocked(false), 2200);
      return;
    }
    if (!configQuestionIds(examConfig).includes(q.id)) handleToggleQuestionInExam(q.id);
    setEditingQuestion(q);
    requestSheetFocus(q.id);
  }

  // « nouvelle » : la question n'existe qu'en mémoire tant qu'elle n'est pas
  // enregistrée, mais la feuille ne sait afficher que des questions connues —
  // on l'insère donc tout de suite, et l'annulation la retire partout.
  function handleNewQuestion() {
    if (editingQuestion) {
      setOpenQuestionBlocked(true);
      setTimeout(() => setOpenQuestionBlocked(false), 2200);
      return;
    }
    const q = emptyQuestion();
    setQuestions(prev => [q, ...prev]);
    setExamConfig(prev => ({ ...prev, sections: toggleQuestionInSections(prev.sections, q.id) }));
    setDraftIds(prev => [...prev, q.id]);
    setNewQuestionId(q.id);
    setEditingQuestion(q);
    requestSheetFocus(q.id);
  }

  function handleCancelQuestion() {
    const id = newQuestionId;
    if (id) {
      setQuestions(prev => prev.filter(p => p.id !== id));
      setExamConfig(prev => ({
        ...prev,
        sections: prev.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) })),
        weighting: clearWeightingFor(prev.weighting, id),
      }));
      setDraftIds(prev => prev.filter(qid => qid !== id));
    }
    setNewQuestionId(null);
    setEditingQuestion(null);
  }

  function handleSaveQuestion(q: Question) {
    setQuestions(prev => {
      const exists = prev.some(p => p.id === q.id);
      if (exists) return prev.map(p => (p.id === q.id ? q : p));
      const withCreatedAt = q.createdAt ? q : { ...q, createdAt: new Date().toISOString() };
      return [withCreatedAt, ...prev];
    });
    setEditingQuestion(null);
    setNewQuestionId(null);
    const toSave = q.createdAt ? q : { ...q, createdAt: new Date().toISOString() };
    saveQuestion(workshopId, toSave).catch(err => console.error('enregistrement question échoué', err));
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
    const pool = { id, name, color: categoryTones.blueGray };
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

  // Un clic sur une carte de la banque met la question dans l'examen, un second
  // l'en retire (comportement de la maquette). Il n'y a plus de liste
  // intermédiaire « questions envoyées » : `draftIds` suit exactement les
  // questions de l'examen — c'est lui qui allume la pastille verte de la carte,
  // et il reste la clé de la reprise du brouillon.
  function handleToggleQuestionInExam(id: string) {
    // La question ouverte dans l'éditeur ne peut pas quitter la copie : elle y a
    // un formulaire posé, avec des modifications en cours qui partiraient avec
    // elle. Un clic sur sa carte se contente donc de recadrer la feuille dessus,
    // comme le fait « modifier » — l'édition continue.
    if (editingQuestion?.id === id) { requestSheetFocus(id); return; }
    const sections = toggleQuestionInSections(examConfig.sections, id);
    const included = configQuestionIds({ ...examConfig, sections }).includes(id);
    setExamConfig({
      ...examConfig,
      sections,
      weighting: included ? examConfig.weighting : clearWeightingFor(examConfig.weighting, id),
    });
    setDraftIds(prev => (included ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(qid => qid !== id)));
    // La question entre toujours à la fin de la dernière partie : sans
    // recadrage, un clic dans la banque n'a aucun effet visible dès que la copie
    // dépasse une page. Au retrait, rien à recadrer — la ligne n'existe plus.
    if (included) requestSheetFocus(id);
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
          pleine largeur (mes examens / questions), feuille A4 toujours visible à
          droite — empilées en dessous de 768px.
          Les deux largeurs ne sont plus figées : elles suivent les paliers
          d'échelle de `.exam-shell` (globals.css) — la feuille de 75 % à 140 %
          d'un A4 selon la place disponible, la liste de 308 à 440px. Les valeurs
          de référence citées plus bas (440 pour la liste, 1236/60/120 pour la
          feuille) sont celles du palier 100 %, toutes multipliées par
          `--exam-scale` aux autres paliers. */}
      {/* Répartition du vide horizontal : les deux colonnes ont une largeur
          fixe, tout le reste est distribué par trois cales flex dans un rapport
          1 : 2 : 3 — marge de page à gauche, écart banque↔feuille (deux fois la
          marge), puis vide à droite de la feuille (inchangé : la moitié du vide
          total, comme dans le rapport 1:1:2 d'origine). Les marges
          négatives de la colonne de droite (-60 / -120) retirent de ce calcul
          tout ce qui sépare son bord du papier : les vides se mesurent alors
          exactement bord à bord de la feuille. Largeur 1236 = les 1188 du bloc
          A4 (TOOLBAR_WIDTH) + les 48 de padding de GeneratorContent (24 à
          gauche, 12 à droite, 12 de plus sur le panneau défilant) — sans quoi
          le bloc déborde et la barre d'outils ne s'aligne plus sur le bord du
          papier. 60 = 24 de padding gauche + 26 de gouttière + 10 d'espace ;
          120 = 12 + 12 de padding droit + 10 d'espace + 86 de gouttière. */}
      {/* `split-shell` (globals.css) borne la hauteur au viewport à partir de
          768px : c'est ce qui rend les deux colonnes indépendantes — la page ne
          défile plus, chaque panneau fait défiler son propre contenu, et la
          marge basse de 28px laisse la bande de crème visible sous les
          panneaux. En dessous de 768px les colonnes s'empilent et c'est la page
          qui défile, comme avant. */}
      {/* Pas de `flex: 1` ici : en tant qu'élément flex, un `flex-basis: 0` fait
          gagner la répartition flex sur la hauteur déclarée et la coquille
          reprendrait la hauteur de son contenu. */}
      <div className="split-shell exam-shell flex flex-col gap-5 mx-[22px] overflow-auto md:mx-0 md:flex-row md:gap-0" style={{ minHeight: 0, marginTop: 22, marginBottom: 28 }}>
        {/* `minWidth` : sur un écran trop étroit même pour le palier à 75 %
            (moins de ~1260px), il ne reste rien à répartir — les cales tombent
            sur leur minimum et c'est la feuille qui est rognée à droite comme
            elle l'était déjà. Ce minimum vaut, pour la cale du milieu, la
            largeur de la gouttière gauche (36px × échelle) : c'est exactement ce
            que la marge négative de la colonne de droite fait déborder dessus,
            et en dessous le fond crème de la barre d'outils collante mordait sur
            la carte de la banque de questions.
            `pointerEvents: 'none'` sur les trois cales : les marges négatives de
            la colonne de droite (-60 / -120) les font chevaucher les gouttières
            de la feuille, et une cale placée APRÈS dans le DOM capte alors les
            clics de la gouttière qu'elle recouvre (les croix de retrait étaient
            devenues inertes). Ce sont des blocs vides, ils n'ont aucune raison
            de recevoir un clic. */}
        <div className="hidden md:block" style={{ flex: '1 1 0', minWidth: 22, pointerEvents: 'none' }} />
        <div className="exam-list-col" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          {/* Colonne sans cadre : ni bordure ni panneau autour de la liste, la
              séparation se fait par le fond (cartes en `surfaceRaised` posées
              sur le crème de la page). Il ne reste que le filet sous les
              onglets, qui pose la barre. */}
          {/* `zoom` : la colonne suit sa propre échelle de texte et d'icônes
              (`--exam-list-zoom`, globals.css), distincte de celle de la
              feuille. Il est posé sur les contenus et jamais sur `.exam-list-col`
              lui-même : sa largeur est fixée en px par le palier, un zoom
              dessus la multiplierait. Le panneau défilant reste hors du zoom,
              comme côté feuille — c'est le contenu qui est mis à l'échelle. */}
          <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${palette.line}`, zoom: 'var(--exam-list-zoom, 1)' }}>
            <button onClick={() => setLeftTab('history')} style={tabButtonStyle(leftTab === 'history', 'left')}>
              <FileText size={15} strokeWidth={1.75} />
              {t('tab.tabHistory')}
            </button>
            <button onClick={() => setLeftTab('bank')} style={tabButtonStyle(leftTab === 'bank', 'right')}>
              <Search size={15} strokeWidth={1.75} />
              {t('tab.tabBank')}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            {/* Montage permanent des deux onglets (display none/block) — préserve
                la recherche/le tri en cours quand on bascule d'onglet, comme le
                fait déjà SettingsClient pour ses sections. */}
            <div className="scroll-panel" style={{ display: leftTab === 'history' ? 'block' : 'none', height: '100%' }}>
              <div style={{ zoom: 'var(--exam-list-zoom, 1)' }}>
                <HistoryContent exams={exams} justAddedId={justAdded} onEdit={requestEditExam} onNew={() => setIntroOpen(true)} onDelete={e => setPendingDeleteExam(e)} />
              </div>
            </div>
            <div className="scroll-panel" style={{ display: leftTab === 'bank' ? 'block' : 'none', height: '100%', position: 'relative' }}>
              <div style={{ zoom: 'var(--exam-list-zoom, 1)' }}>
              <BankContent
                questions={questions}
                pools={pools}
                exams={exams}
                notions={notions}
                chapters={chapters}
                draftIds={draftIds}
                editingQuestionId={editingQuestion?.id ?? null}
                openId={openId}
                setOpenId={setOpenId}
                onEditQuestion={requestEditQuestion}
                onNewQuestion={handleNewQuestion}
                onToggleInExam={handleToggleQuestionInExam}
                onCreatePool={handleCreatePool}
                onUpdatePool={handleUpdatePool}
                onDeletePool={handleDeletePool}
                onDeleteQuestion={handleDeleteQuestion}
              />
              </div>
            </div>
          </div>
        </div>

        {/* Pas de carte autour de la feuille : le seul cadre visible doit être
            celui du papier lui-même (bordure + ombre du bloc A4), comme dans la
            maquette. Un panneau blanc de plus créait un encadré dans l'encadré. */}
        <div className="hidden md:block" style={{ flex: '2 1 0', minWidth: 'calc(36px * var(--exam-scale, 1) + 8px)', pointerEvents: 'none' }} />
        <div className="exam-sheet-col" style={{ minWidth: 0, minHeight: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <GeneratorContent
            workshopId={workshopId}
            questions={questions}
            config={examConfig}
            onConfigChange={setExamConfig}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onGenerate={handleGenerate}
            onOpenQuestion={handleOpenQuestion}
            onRemoveFromDraft={handleRemoveFromDraft}
            onClearEditor={handleClearEditor}
            editingQuestion={editingQuestion}
            newQuestionId={newQuestionId}
            focusRequest={sheetFocus}
            onRequestFocus={requestSheetFocus}
            pools={pools}
            notions={notions}
            onCreatePool={handleCreatePool}
            onUpdatePool={handleUpdatePool}
            onDeletePool={handleDeletePool}
            onSaveQuestion={handleSaveQuestion}
            onCancelQuestion={handleCancelQuestion}
          />
        </div>
        <div className="hidden md:block" style={{ flex: '3 1 0', minWidth: 22, pointerEvents: 'none' }} />
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
              <div style={{ position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden', background: `linear-gradient(160deg, ${palette.creamAlt} 0%, ${palette.tanTint} 100%)`, boxShadow: `0 28px 70px ${ink(0.32)}` }}>
                <button onClick={() => setIntroOpen(false)} title={t('tab.introClose')} style={{ position: 'absolute', top: 18, right: 18, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', border: `1px solid ${ink(0.12)}`, background: palette.paper, color: palette.ink, cursor: 'pointer' }}>
                  <X size={17} strokeWidth={2} />
                </button>

                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${HEADER_PCT}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 70px', textAlign: 'center' }}>
                  <div style={{ fontSize: 23, fontWeight: 600, color: palette.ink }}>{t('tab.introTitle')}</div>
                  <div style={{ fontSize: 13.5, color: palette.inkFaint, marginTop: 8 }}>{t('tab.introSubtitle')}</div>
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
                    <div style={{ fontSize: 16, fontWeight: 600, color: palette.tanStrong, marginBottom: 8 }}>{step.title}</div>
                    <div style={{ fontSize: 13.5, color: palette.inkMuted, lineHeight: 1.65 }}>{step.text}</div>
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
                    background: `radial-gradient(circle at 32% 28%, ${palette.goldTint} 0%, ${palette.gold} 55%, ${palette.amberLight} 100%)`,
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
                    color: withAlpha(palette.tanStrong, 0.55),
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
