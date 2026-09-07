'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, FileText, Search, X } from 'lucide-react';
import { palette, ink, radius, withAlpha, categoryTones } from '@/lib/theme';
import { useIsPhone } from '@/lib/useIsPhone';
import { type Question, emptyQuestion } from './QuestionEditor';
import {
  getExamPageData, saveQuestion, createPool as createPoolAction, updatePool as updatePoolAction,
  deletePool as deletePoolAction, deleteQuestion as deleteQuestionAction, saveGeneratedExam,
  deleteGeneratedExam, saveExamDraft,
} from '@/app/actions/examQuestions';
import {
  type Exam, type Pool, type ExamConfig, type SheetFocus,
  defaultExamConfig, normalizeExamConfig, configQuestionIds, formatDuration, clearWeightingFor,
  toggleQuestionInSections, isPageBreakId, pruneUnknownQuestions, LIST_INSET_X, partWeightKey,
} from './examen/examShared';
import { Tooltip } from '@/components/ui/tooltip';
import HistoryContent from './examen/HistoryContent';
import BankContent from './examen/BankContent';
import GeneratorContent from './examen/GeneratorContent';
import InlineQuestionEditor from './examen/InlineQuestionEditor';

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
  // Un glisser est en cours sur la feuille (voir `onDragActiveChange` de
  // `GeneratorContent`) : la colonne des questions cesse alors de défiler.
  const [sheetDragging, setSheetDragging] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  /** Les questions et les examens ne sont pas encore arrivés du serveur.
   *
   *  ⚠️ **Ce n'est pas qu'un habillage** (07/09/2026) : tant que c'est vrai,
   *  RIEN ne doit pouvoir créer ni modifier de question. La réponse du serveur
   *  remplace la liste des questions et le brouillon de la copie ; une question
   *  créée entre-temps n'existait qu'en mémoire, elle disparaissait donc à
   *  l'arrivée des données — mais le formulaire, lui, restait « ouvert » dans le
   *  dos de l'application, ce qui bloquait toute création et toute modification
   *  jusqu'au rechargement de la page (signalé par Alexis). Les listes montrent
   *  des encadrés d'attente pendant ce temps, et les gestes de création sont
   *  éteints : le geste refusé est ainsi visible, au lieu d'être perdu. */
  const [loading, setLoading] = useState(true);
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
  // Ce que le formulaire porte À L'INSTANT, frappe par frappe : la copie
  // l'affiche à la place de la question enregistrée, pour qu'on voie sur la
  // feuille ce qu'on écrit dans la liste (06/09/2026). Remis à `null` en même
  // temps que le formulaire se ferme — sans quoi la copie garderait un aperçu
  // qui ne correspond plus à rien.
  const [editingDraft, setEditingDraft] = useState<Question | null>(null);
  // ─── Téléphone : une seule des deux colonnes à la fois ────────────────────
  //
  // La liste et la copie ne tiennent pas ensemble sur un écran de téléphone. On
  // en montre donc UNE, et l'autre reste montée mais masquée — ce qui préserve
  // la recherche, le tri et le défilement en cours, comme la bascule entre les
  // deux onglets de la colonne de gauche.
  //
  // Le parcours normal : on arrive sur la liste ; ouvrir un examen bascule sur
  // la copie ; la flèche de retour ramène à la liste, où l'on ajoute des
  // questions en les touchant (autant qu'on veut) ; une barre « retour à
  // l'examen » ramène à la copie tant qu'un examen est en cours.
  const isPhone = useIsPhone();
  const [phonePane, setPhonePane] = useState<'list' | 'sheet'>('list');
  const [newQuestionId, setNewQuestionId] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig>(defaultExamConfig());
  const [pendingEditExam, setPendingEditExam] = useState<Exam | null>(null);
  // Geste refusé parce qu'un formulaire de question est ouvert sur la feuille —
  // `null` quand il n'y en a pas. Deux gestes distincts sont concernés, et le
  // toast ne dit pas la même chose pour l'un et pour l'autre : ouvrir une
  // seconde question, ou enregistrer l'examen.
  const [blockedAction, setBlockedAction] = useState<'open' | 'save' | null>(null);
  const blockedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ⚠️ **Il n'y a plus de fenêtre d'accueil** (07/09/2026, demandé par Alexis).
   *  « + nouvel » ouvrait une présentation en trois étapes dont le bouton final
   *  ne faisait que ce qu'on demandait : vider la copie et montrer les questions.
   *  Le geste le fait maintenant directement. Reste cette confirmation, et
   *  uniquement quand il y a quelque chose à perdre : la copie en cours est
   *  jetée, et rien ailleurs ne la rattrape.  */
  const [confirmNewExamOpen, setConfirmNewExamOpen] = useState(false);
  // Ligne de la feuille à ramener au centre du panneau de droite. Tout ce qui
  // ajoute ou ouvre quelque chose sur la copie passe par là : la question
  // envoyée depuis la banque, le formulaire en ligne, « + partie » et « + saut
  // de page » (ces deux-là depuis la feuille, via `onRequestFocus`). Le jeton
  // rejoue le recadrage quand la même ligne est visée deux fois de suite.
  const [sheetFocus, setSheetFocus] = useState<SheetFocus | null>(null);

  /** La copie recadre du MINIMUM sur la ligne visée (voir `GeneratorContent`) :
   *  une ligne déjà entièrement visible ne la fait donc pas bouger, et aucun
   *  appelant n'a de précaution à prendre pour ça. */
  function requestSheetFocus(key: string) {
    setSheetFocus(prev => ({ key, token: (prev?.token ?? 0) + 1 }));
  }

  /** Refus d'un geste tant qu'une question est ouverte sur la feuille. Le timer
   *  est gardé en ref : sans ça, deux gestes refusés coup sur coup feraient
   *  disparaître le second toast au bout du délai du premier. */
  function blockForOpenQuestion(action: 'open' | 'save') {
    if (blockedTimer.current) clearTimeout(blockedTimer.current);
    setBlockedAction(action);
    blockedTimer.current = setTimeout(() => setBlockedAction(null), 2200);
  }

  function isEditorEmpty() {
    return editing === null && draftIds.length === 0 && examConfig.title.trim() === '' && configQuestionIds(examConfig).length === 0;
  }

  /** Ouvre une copie vierge. La confirmation n'apparaît que si la copie en
   *  cours porte quelque chose — sinon il n'y a rien à jeter, et demander
   *  serait une question pour rien. */
  function requestNewExam() {
    if (isEditorEmpty()) { startNewExam(); return; }
    setConfirmNewExamOpen(true);
  }

  function startNewExam() {
    setConfirmNewExamOpen(false);
    handleClearEditor();
    // La banque au premier plan : une copie vierge se remplit de questions, et
    // c'est là qu'on les prend. Sur téléphone, c'est aussi ce que faisait le
    // bouton final de l'ancienne fenêtre d'accueil.
    focus('bank');
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
    // Un seul aller-retour : Next met les server actions à la queue leu leu, donc
    // deux appels « en parallèle » n'en sont pas — voir `getExamPageData`.
    getExamPageData(workshopId).then(({ questions, pools, exams, notions, chapters, draft }) => {
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
        const config = draft.config?.sections ? pruneUnknownQuestions(normalizeExamConfig(draft.config), keep) : defaultExamConfig();
        setExamConfig(config);
        // Second filet : `draftIds` doit être exactement la liste des questions
        // posées sur la copie (voir `handleToggleQuestionInExam`) — il ne dit
        // rien de plus, il sert seulement à allumer la pastille verte des cartes
        // de la banque. On le relit donc des parties plutôt que de faire
        // confiance à la liste enregistrée : un brouillon écrit avant le
        // correctif du 17/08/2026 (retrait d'une partie qui oubliait ses
        // questions) porte des identifiants que la copie ne montre plus, et
        // rien ne l'en sortait — le rechargement réenregistrait l'écart tel quel.
        setDraftIds(configQuestionIds(config));
        if (draft.editingId) {
          const found = mappedExams.find(e => e.id === draft.editingId);
          if (found) setEditing(found);
        }
      }
    }).catch(err => console.error('chargement banque de questions échoué', err))
      .finally(() => { draftLoaded.current = true; setLoading(false); });
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

  // Réinitialiser jette toute la copie : le formulaire ouvert part avec elle, et
  // la question neuve qu'il portait éventuellement — qui n'existe qu'en mémoire
  // tant qu'elle n'est pas enregistrée — est retirée de la banque par
  // `handleCancelQuestion`. Sans cette fermeture, `editingQuestion` survivait à
  // une copie vidée : le formulaire n'était plus rendu nulle part (sa ligne
  // avait disparu de la feuille) mais bloquait encore l'ouverture de toute autre
  // question. Le geste a déjà sa confirmation, il n'y a rien à demander de plus.
  function handleClearEditor() {
    handleCancelQuestion();
    setEditing(null);
    setDraftIds([]);
    setExamConfig(defaultExamConfig());
  }

  // Amène un onglet au premier plan de la colonne gauche. « generator » (la
  // feuille A4) n'est plus un onglet dans la coquille retenue — elle est déjà
  // toujours visible dans la colonne de droite, donc no-op. Signature conservée
  // pour ne pas toucher les appelants (`requestEditExam`, `handleGenerate`…).
  function focus(id: LeftTab | 'generator') {
    // Sur grand écran, la copie est déjà visible en permanence : « generator »
    // n'a rien à faire. Sur téléphone, c'est le geste qui l'amène à l'écran.
    if (id === 'generator') { setPhonePane('sheet'); return; }
    setLeftTab(id);
    setPhonePane('list');
  }

  function handleGenerate() {
    // Une question ouverte interdit l'enregistrement : son formulaire porte des
    // modifications non enregistrées, et si elle vient d'être créée elle n'existe
    // qu'en mémoire — l'examen partirait en base avec l'identifiant d'une
    // question absente, faussant son compte de questions et son barème total. Il
    // laisserait en plus `editingQuestion` ouvert sur une copie vidée, ce qui
    // bloquait toute édition ultérieure jusqu'au rechargement de la page. On
    // renvoie donc au formulaire, à terminer par « enregistrer » ou « annuler ».
    if (editingQuestion) {
      blockForOpenQuestion('save');
      requestSheetFocus(editingQuestion.id);
      return;
    }
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
    // L'examen supprimé était celui qu'on modifiait : la copie se vide, donc
    // exactement la même remise à zéro que « réinitialiser » — formulaire de
    // question ouvert compris, sans quoi il resterait à bloquer l'édition.
    if (editing?.id === exam.id) handleClearEditor();
    deleteGeneratedExam(workshopId, exam.id).catch(err => console.error('suppression de l\'examen échouée', err));
  }

  // Ouvre le formulaire en ligne sur la feuille. Une seule question à la fois :
  // deux formulaires ouverts, ce serait deux brouillons concurrents pour un même
  // examen. Rappuyer sur le bouton de la question déjà ouverte referme le
  // formulaire — même effet que son bouton « annuler ».
  function handleOpenQuestion(id: string, rowKey?: string) {
    const q = questions.find(p => p.id === id);
    if (!q) return;
    if (editingQuestion) {
      if (editingQuestion.id === id) { handleCancelQuestion(); return; }
      blockForOpenQuestion('open');
      return;
    }
    setEditingQuestion(q);
    setEditingDraft(q);
    // Le formulaire s'ouvre dans la liste : encore faut-il qu'elle soit au
    // premier plan. Sans ça, cliquer une question de la copie depuis l'onglet
    // « mes examens » ouvrait un formulaire que personne ne voyait. Sur
    // téléphone, il s'ouvre sur la copie elle-même : on n'en bouge pas.
    if (!isPhone) focus('bank');
    // ⚠️ **On vise la LIGNE cliquée, pas la grappe** (06/09/2026) : le
    // double-clic sur la troisième question d'un enchaînement ramenait la copie
    // sur la première, qui pouvait être une page plus haut. Et comme le
    // recadrage défile du minimum, une ligne déjà entièrement visible — celle
    // qu'on vient de cliquer, le plus souvent — ne fait rien bouger.
    requestSheetFocus(rowKey ?? id);
  }

  // Crayon de la banque : le formulaire s'ouvre DANS LA LISTE, à la place de la
  // carte (06/09/2026, comme les questions du parcours).
  //
  // ⚠️ La question n'est plus ajoutée à l'examen au passage. Elle l'était parce
  // que l'édition se faisait sur la copie, et qu'il fallait donc l'y mettre pour
  // pouvoir la modifier : corriger une faute de frappe depuis la banque
  // l'imposait à l'examen en cours de composition, sans que personne ne l'ait
  // demandé. La copie ne recadre que sur une question qui s'y trouve déjà.
  function requestEditQuestion(q: Question) {
    if (editingQuestion) {
      if (editingQuestion.id === q.id) { handleCancelQuestion(); return; }
      blockForOpenQuestion('open');
      return;
    }
    setEditingQuestion(q);
    setEditingDraft(q);
    if (configQuestionIds(examConfig).includes(q.id)) requestSheetFocus(q.id);
  }

  // « nouvelle » : la question n'existe qu'en mémoire tant qu'elle n'est pas
  // enregistrée, mais la feuille ne sait afficher que des questions connues —
  // on l'insère donc tout de suite, et l'annulation la retire partout.
  // ⚠️ **La question NEUVE est retirée de la LISTE** le temps qu'elle soit
  // enregistrée (06/09/2026). Elle existe bien dans `questions` — il le faut, la
  // copie doit pouvoir l'afficher —, mais dans la liste elle se rangeait selon le
  // tri en cours : sans date de création, « du plus récent » la mettait tout en
  // BAS, et le formulaire qu'on venait d'ouvrir partait avec elle. Absente de la
  // liste, elle passe par le cas « pas de carte où se poser » de
  // `QuestionListView`, qui pose le formulaire tout en HAUT — exactement ce que
  // fait déjà le parcours. Elle rejoint la liste, datée, à l'enregistrement.
  const bankQuestions = newQuestionId ? questions.filter(q => q.id !== newQuestionId) : questions;

  // ⚠️ **Un seul formulaire à l'écran, jamais deux.** Sur téléphone, quand la
  // copie est affichée, la liste n'est pas visible : le formulaire s'ouvre alors
  // SUR la copie, à la place de la ligne — sans quoi modifier une question
  // depuis la copie n'ouvrirait rien de visible. Partout ailleurs il vit dans la
  // liste. Les deux sont le même composant ; ce qui change, c'est où il est
  // rendu, et la liste cesse de le rendre dès que la copie s'en charge (deux
  // instances voudraient dire deux brouillons pour une seule question).
  const sheetCarriesEditor = isPhone && phonePane === 'sheet' && editingQuestion !== null;

  function handleNewQuestion(initialStatement?: string) {
    handleNewQuestionInSection(-1, initialStatement);
  }

  /** Question neuve posée à la FIN D'UNE PARTIE précise — c'est ce que demande
   *  le double-clic dans le blanc de la copie (07/09/2026) : le vide d'une page
   *  prolonge la partie qui s'y trouve, la question doit donc s'y ranger, et pas
   *  filer à la fin de l'examen quand un saut de page laisse du blanc au milieu.
   *  Un index qui ne désigne aucune partie (-1) vaut « à la fin de l'examen » :
   *  c'est le cas du bouton « nouvelle question » de la banque, qui ne vise
   *  aucun endroit. */
  function handleNewQuestionInSection(sectionIdx: number, initialStatement?: string) {
    // Tant que le serveur n'a pas répondu, sa réponse écraserait la question
    // qu'on créerait ici — voir `loading`. Les affordances sont déjà éteintes ;
    // ce filet couvre ce qui pourrait les contourner (double-clic sur la copie).
    if (loading) return;
    if (editingQuestion) {
      blockForOpenQuestion('open');
      return;
    }
    // L'énoncé peut arriver pré-rempli : c'est le texte qu'on avait commencé à
    // écrire côté IA, que la bascule fait suivre (voir `sharedText`).
    const q = { ...emptyQuestion(), content: initialStatement ?? '' };
    setQuestions(prev => [q, ...prev]);
    setExamConfig(prev => ({
      ...prev,
      sections: prev.sections[sectionIdx]
        ? prev.sections.map((sec, i) => (i === sectionIdx ? { ...sec, questionIds: [...sec.questionIds, q.id] } : sec))
        : toggleQuestionInSections(prev.sections, q.id),
    }));
    setDraftIds(prev => [...prev, q.id]);
    setNewQuestionId(q.id);
    setEditingQuestion(q);
    setEditingDraft(q);
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
    setEditingDraft(null);
  }

  /** Le formulaire de question, rendu DANS LA LISTE (06/09/2026) — à la place
   *  de la carte quand elle est visible, en tête sinon (c'est `QuestionListView`
   *  qui décide où). Il se réglait auparavant sur la feuille A4, à la place de la
   *  ligne : la copie ne montrait alors plus la question, et modifier une
   *  question qui n'était pas dans l'examen l'y faisait entrer de force.
   *
   *  `key` sur l'identifiant, comme côté parcours : passer d'une question à
   *  l'autre sans quitter la liste garde le formulaire au même endroit de
   *  l'arbre, et React réutiliserait son état — le brouillon de la précédente
   *  resterait affiché sous le titre de la suivante.
   *
   *  Le décalage des pondérations au retrait d'une question liée se fait ici :
   *  elles sont indexées par POSITION (`partWeightKey`), donc retirer la
   *  deuxième doit remonter toutes les suivantes d'un cran. C'est l'examen qui
   *  les porte, et c'est ici qu'il vit. */
  function renderQuestionEditor(frame: 'plain' | 'sheet' | 'bare' = 'plain', number?: number, hideTitle?: boolean) {
    if (!editingQuestion) return null;
    return (
      <InlineQuestionEditor
        key={editingQuestion.id}
        hideTitle={hideTitle}
        workshopId={workshopId}
        question={editingQuestion}
        number={frame === 'sheet' ? number : undefined}
        isNew={newQuestionId === editingQuestion.id}
        frame={frame}
        pools={pools}
        notions={notions}
        onDraftChange={setEditingDraft}
        onRemovePart={idx => shiftPartWeights(editingQuestion.id, idx)}
        onCreatePool={handleCreatePool}
        onUpdatePool={handleUpdatePool}
        onDeletePool={handleDeletePool}
        poolUsageCount={pid => questions.filter(qq => qq.pools.includes(pid)).length}
        onSave={handleSaveQuestion}
        onCancel={handleCancelQuestion}
      />
    );
  }

  /** Les pondérations d'une grappe sont indexées par position : retirer la
   *  question liée `removedIdx` fait remonter toutes les suivantes d'un cran,
   *  et la dernière clé disparaît. */
  function shiftPartWeights(questionId: string, removedIdx: number) {
    setExamConfig(prev => {
      const weighting = { ...prev.weighting };
      let i = removedIdx;
      for (;;) {
        const next = weighting[partWeightKey(questionId, i + 1)];
        if (!next) break;
        weighting[partWeightKey(questionId, i)] = next;
        i += 1;
      }
      delete weighting[partWeightKey(questionId, i)];
      return { ...prev, weighting };
    });
  }

  function handleSaveQuestion(q: Question) {
    // ⚠️ **La date se pose AVANT de choisir la branche, jamais dans une seule
    // des deux** (06/09/2026). Une question neuve existe déjà dans `questions` —
    // il le faut, la copie doit pouvoir l'afficher — donc `exists` est vrai pour
    // elle aussi, et la branche « nouvelle » qui datait la question n'était
    // jamais empruntée. Sans date, le tri « du plus récent » la renvoyait tout
    // en bas jusqu'au rechargement de la page. La base fait toujours foi (défaut
    // de la colonne) ; cette date-ci ne sert qu'à trier en attendant de la relire.
    const saved = q.createdAt ? q : { ...q, createdAt: new Date().toISOString() };
    setQuestions(prev => (
      prev.some(p => p.id === saved.id)
        ? prev.map(p => (p.id === saved.id ? saved : p))
        : [saved, ...prev]
    ));
    setEditingQuestion(null);
    setEditingDraft(null);
    setNewQuestionId(null);
    saveQuestion(workshopId, saved).catch(err => console.error('enregistrement question échoué', err));
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
        {/* Sur téléphone, une seule colonne à la fois — l'autre reste MONTÉE,
            masquée : la recherche, le tri et le défilement en cours survivent à
            l'aller-retour, comme entre les deux onglets de cette colonne. */}
        <div className="exam-list-col" style={{ flexShrink: 0, display: isPhone && phonePane !== 'list' ? 'none' : 'flex', flexDirection: 'column', minHeight: 420 }}>
          {/* Retour à l'examen en cours — téléphone seulement, et seulement s'il
              y a un examen à retrouver. C'est le pendant de la flèche de la
              copie : on vient ici prendre des questions (les toucher les ajoute,
              autant qu'on veut), puis on repart voir la feuille. */}
          {isPhone && phonePane === 'list' && !isEditorEmpty() && (
            <button
              type="button"
              onClick={() => setPhonePane('sheet')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', margin: `0 ${LIST_INSET_X}px 10px`, fontSize: 12.5, fontWeight: 600, color: palette.ink, background: palette.surfaceRaised, border: `1px solid ${palette.lineStrong}`, borderRadius: 999, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <ArrowLeft size={14} strokeWidth={1.75} />
              {t('tab.phoneBackToExam')}
            </button>
          )}
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
          {/* Même retrait horizontal que les cartes des deux listes
              (`LIST_INSET_X`) : la barre et son filet s'arrêtent pile sur leur
              bord. Le retrait est en `margin` et non en `padding` pour que le
              filet du bas s'arrête lui aussi. */}
          <div style={{ display: 'flex', flexShrink: 0, marginLeft: LIST_INSET_X, marginRight: LIST_INSET_X, borderBottom: `1px solid ${palette.line}`, zoom: 'var(--exam-list-zoom, 1)' }}>
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
            {/* `overflowY: hidden` pendant un glisser sur la copie : le
                navigateur fait défiler de lui-même le conteneur défilant qu'on
                survole, et la liste partait donc avec la feuille dès qu'on
                approchait de son bord haut ou bas. Un conteneur non défilant
                n'est pas concerné. Aucun effet de bord visible : les barres de
                défilement de `.scroll-panel` sont déjà masquées (globals.css),
                leur disparition ne décale rien — et la position de défilement
                est conservée. */}
            <div className="scroll-panel" style={{ display: leftTab === 'history' ? 'block' : 'none', height: '100%', overflowY: sheetDragging ? 'hidden' : undefined }}>
              <div style={{ zoom: 'var(--exam-list-zoom, 1)' }}>
                <HistoryContent workshopId={workshopId} exams={exams} loading={loading} justAddedId={justAdded} onEdit={requestEditExam} onNew={requestNewExam} onDelete={e => setPendingDeleteExam(e)} />
              </div>
            </div>
            <div className="scroll-panel" style={{ display: leftTab === 'bank' ? 'block' : 'none', height: '100%', position: 'relative', overflowY: sheetDragging ? 'hidden' : undefined }}>
              <div style={{ zoom: 'var(--exam-list-zoom, 1)' }}>
              <BankContent
                workshopId={workshopId}
                questions={bankQuestions}
                loading={loading}
                pools={pools}
                exams={exams}
                notions={notions}
                chapters={chapters}
                draftIds={draftIds}
                // La liste passe ses consignes de rendu : dans l'encadré de
                // création, le formulaire n'a ni cadre propre ni titre seul.
                renderEditor={sheetCarriesEditor ? undefined : opts => renderQuestionEditor(opts?.bare ? 'bare' : 'plain', undefined, opts?.hideTitle)}
                editingQuestionId={editingQuestion?.id ?? null}
                editingIsNew={editingQuestion !== null && editingQuestion.id === newQuestionId}
                openId={openId}
                setOpenId={setOpenId}
                onEditQuestion={requestEditQuestion}
                onNewQuestion={handleNewQuestion}
                onCancelNewQuestion={handleCancelQuestion}
                draftStatement={editingDraft?.content ?? ''}
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
        <div className="exam-sheet-col" style={{ minWidth: 0, minHeight: 420, display: isPhone && phonePane !== 'sheet' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <GeneratorContent
            workshopId={workshopId}
            questions={questions}
            config={examConfig}
            onConfigChange={setExamConfig}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onGenerate={handleGenerate}
            onOpenQuestion={handleOpenQuestion}
            onNewQuestionInSection={handleNewQuestionInSection}
            onRemoveFromDraft={handleRemoveFromDraft}
            onClearEditor={handleClearEditor}
            previewQuestion={editingDraft}
            sheetEditor={sheetCarriesEditor && editingQuestion ? { questionId: editingQuestion.id, render: (number: number) => renderQuestionEditor('sheet', number) } : undefined}
            onBack={isPhone ? () => setPhonePane('list') : undefined}
            focusRequest={sheetFocus}
            onRequestFocus={requestSheetFocus}
            onDragActiveChange={setSheetDragging}
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
      {confirmNewExamOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setConfirmNewExamOpen(false)} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: palette.cream, borderRadius: 20, padding: '32px 28px 24px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: withAlpha(palette.danger, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>!</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: palette.ink }}>{t('tab.newExamTitle')}</div>
            <div style={{ fontSize: 13, color: palette.inkMuted, lineHeight: 1.5 }}>{t('tab.newExamDesc')}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
              <button onClick={() => setConfirmNewExamOpen(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${ink(0.15)}`, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: palette.inkMuted, cursor: 'pointer' }}>{t('cancel')}</button>
              <button onClick={startNewExam} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: palette.green, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: palette.paper, cursor: 'pointer' }}>{t('tab.newExamConfirm')}</button>
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
      {blockedAction && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: palette.ink, color: palette.parchment, fontFamily: 'var(--font-sans)', fontSize: 12.5, boxShadow: `0 12px 32px ${ink(0.30)}` }}>
          <AlertTriangle size={14} strokeWidth={2} color={palette.amberGlow} />
          {blockedAction === 'save' ? t('tab.questionEditingSave') : t('tab.questionEditing')}
        </div>,
        document.body
      )}
    </div>
  );
}
