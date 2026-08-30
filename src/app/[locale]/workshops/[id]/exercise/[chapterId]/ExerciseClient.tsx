'use client';

// Écran d'exercice : une question tirée au hasard parmi celles du chapitre, une
// zone de réponse, puis la correction après validation.
//
// ⚠️ Le client ne reçoit jamais la réponse tant qu'il n'a pas validé : le
// tirage renvoie un `ExercisePrompt` (sans `answer` ni `correctChoices`) et la
// correction est calculée par le serveur. Voir app/actions/parcoursExercise.ts.
//
// Les choix portent leur index d'origine (`choice.index`) : c'est lui qu'on
// renvoie à la validation, ce qui permet au serveur de mélanger l'ordre
// d'affichage sans mémoriser de permutation.
//
// Coquille plein écran (position fixed, au-dessus de la barre du haut/du bas —
// masquées par ailleurs sur /exercise/ dans DashboardHeader.tsx).
//
// ── Un exercice = 12 niveaux de Bloom (29/08/2026) ──────────────────────────
//
// Ce n'est pas un nombre de questions : chaque question coûte ce qu'elle
// demande de plus exigeant, et l'exercice s'arrête quand le budget est
// consommé. Douze questions faciles, ou cinq difficiles. Le décompte est tenu
// par le serveur, qui choisit chaque question d'après la maîtrise du membre —
// l'écran ne fait qu'afficher où il en est.
//
// Le tirage suivant part DÈS LA CORRECTION AFFICHÉE, pendant que le membre la
// lit : une question d'avance, jamais plus. C'est ce qui rend le passage à la
// suivante instantané tout en gardant un choix calculé sur la progression qui
// vient d'avoir lieu.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Droplet, FileText, Leaf, Loader2, RotateCw, Sprout, Upload, X } from 'lucide-react';
import { palette, radius, withAlpha, shadow } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import LinkButton from '@/components/LinkButton';
import { drawExercise, gradeExercise } from '@/app/actions/parcoursExercise';
import type { ExerciseAnswer, ExercisePart, ExercisePrompt, ExerciseResult } from '@/lib/workshops/examTypes';
import { EXERCISE_BLOOM_BUDGET, tableCellKey } from '@/lib/workshops/examTypes';
import { matchListEntries } from '@/lib/workshops/answerMatch';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  chapterId: string;
  chapterName: string;
};

/** Ce que rend le tirage — déduit de l'action plutôt que réimporté : un fichier
 *  `'use server'` n'expose pas ses types au client (piège Turbopack, cf.
 *  .claude/rules/server-architecture.md). */
type DrawResult = Awaited<ReturnType<typeof drawExercise>>;

/** Sentinelle d'un tirage qui n'a pas abouti (réseau coupé, action injoignable).
 *  Un jeton plutôt qu'un message : la traduction se fait à l'affichage, sinon il
 *  faudrait faire entrer `t` dans les dépendances du tirage — et le premier
 *  tirage se relancerait à chaque rendu. */
const DRAW_FAILED = '__draw_failed__';

// Réponses des types qui ne se donnent pas en cochant une proposition.
// Regroupées en UN objet par énoncé plutôt qu'en cinq tableaux parallèles, qu'il
// faudrait tous réindexer à chaque tirage.
//
// La liste, la grille et les paires PARTENT À LA CORRECTION depuis le
// 25/08/2026 (voir `toAnswers`) ; le dessin et le fichier restent purement
// locaux, faute de correcteur qui saurait les juger.
type ExtraAnswer = {
  /** liste — une entrée par ligne attendue. */
  list: string[];
  /** tableau — cases cochées, en clés « ligne-colonne » (même forme que `tableChecked`). */
  table: string[];
  /** matching — index de l'élément de gauche → index de sa correspondance à droite. */
  match: Record<number, number>;
  /** dessin — une polyligne par trait, en points « x,y » du repère 0-100. */
  strokes: string[];
  /** fichier — nom du fichier déposé (le dépôt réel reste à brancher, voir plus bas). */
  fileName: string;
};

const emptyExtra = (): ExtraAnswer => ({ list: [], table: [], match: {}, strokes: [], fileName: '' });

/** Nombre de lignes attendues d'une liste — au moins une, sinon la zone de
 *  réponse serait vide et l'énoncé invalidable. */
function listRowCount(statement: ExercisePart): number {
  return Math.max(1, statement.typeOptions.listExpected ?? statement.textLines ?? 3);
}

/** Un énoncé attend-il une réponse saisie par l'élève ? `sans_reponse` est le
 *  seul type où le bouton ne fait qu'afficher la correction. */
function isAnswered(statement: ExercisePart, choices: number[], text: string, extra: ExtraAnswer): boolean {
  switch (statement.responseType) {
    case 'sans_reponse': return true;
    case 'qcs':
    case 'qcm': return choices.length > 0;
    case 'liste': return extra.list.some((v) => v.trim().length > 0);
    case 'tableau': return extra.table.length > 0;
    case 'matching': return Object.keys(extra.match).length > 0;
    case 'dessin': return extra.strokes.length > 0;
    case 'fichier': return extra.fileName.length > 0;
    default: return text.trim().length > 0;
  }
}

// `chapterName` n'est plus affiché : la maquette réserve l'en-tête de la coque à
// la progression et aux gouttes. La prop reste au contrat de la page, qui la
// résout déjà pour son `notFound()`.
export default function ExerciseClient({ locale, workshopId, workshopName, chapterId }: Props) {
  const t = useTranslations('exercise');
  const tExam = useTranslations('examen');

  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState<ExercisePrompt | null>(null);
  // Un tableau par énoncé de la grappe : l'indice 0 est la question principale,
  // les suivants ses questions liées, dans l'ordre de `prompt.parts`.
  const [selected, setSelected] = useState<number[][]>([[]]);
  const [freeText, setFreeText] = useState<string[]>(['']);
  const [extra, setExtra] = useState<ExtraAnswer[]>([emptyExtra()]);
  /** Correction de chaque énoncé, `null` tant qu'il n'a pas été validé. Un
   *  tableau et non un objet unique : une grappe se corrige énoncé par énoncé,
   *  et les corrections déjà rendues restent à l'écran. */
  const [outcomes, setOutcomes] = useState<(ExerciseResult | null)[]>([null]);
  /** Combien d'énoncés de la grappe sont affichés. On commence au premier seul,
   *  et « suivant » en découvre un de plus — jamais un écran vierge : le
   *  précédent reste au-dessus, avec sa correction. */
  const [shown, setShown] = useState(1);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  /** Niveaux de Bloom déjà consommés — par les questions RÉPONDUES, pas posées. */
  const [spent, setSpent] = useState(0);
  /** Ce que coûte la question affichée, décompté à sa validation. */
  const [cost, setCost] = useState(0);
  /** Plus rien ne viendra après la question affichée : le bouton du bas propose
   *  alors de terminer, plutôt que d'annoncer une question suivante qui
   *  n'existe pas. */
  const [noMore, setNoMore] = useState(false);
  /** Trois fautes expédiées d'affilée : on le dit avec la correction, sans
   *  rien empêcher (voir @/lib/workshops/answerPace). */
  const [tooFast, setTooFast] = useState(false);
  /** Minutes de pause restantes, quand le serveur a refusé la question
   *  suivante après cinq fautes expédiées. */
  const [blockedMinutes, setBlockedMinutes] = useState(0);
  /** Pourquoi le dernier tirage n'a rien rendu — deux impasses très différentes
   *  à l'écran : un chapitre sans aucune question (le gestionnaire a du travail)
   *  et un chapitre dont rien n'est encore à la portée du membre (il n'y est
   *  pour rien, et personne n'a à être mis en cause). */
  const [failure, setFailure] = useState<DrawResult['failure']>(null);

  // Grappes déjà posées dans CET exercice, pour ne pas en reproposer une dont la
  // correction n'a pas abouti (la trace en base ne s'écrit qu'à la correction).
  // En ref et non en état : les tirages partent de gestionnaires d'événements,
  // qui liraient sinon la valeur figée au rendu.
  const servedRef = useRef<string[]>([]);
  /** Questions tirées et pas encore affichées. */
  const queueRef = useRef<DrawResult[]>([]);
  /** Somme des coûts de TOUT ce qui a été tiré — affiché, répondu ou en file.
   *  C'est lui qui borne l'exercice : un tirage réserve sa part du budget au
   *  moment où il part, pas quand la question est répondue. Sans quoi les deux
   *  questions d'avance pourraient faire dépasser les 12 niveaux. */
  const committedRef = useRef(0);
  /** Les tirages s'enchaînent au lieu de partir en parallèle : chacun a besoin
   *  du coût du précédent pour savoir ce qui reste du budget. */
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  /** Dernière impasse rencontrée, gardée pour l'écran de fin ou d'accueil. */
  const failedRef = useRef<DrawResult | null>(null);
  const startedRef = useRef(false);
  /** Quand la question affichée l'a été. Le serveur ne peut pas le savoir : il a
   *  tiré cette question bien avant, pendant que la précédente était traitée. */
  const shownAtRef = useRef(0);

  /** Installe une question tirée : une case de réponse par énoncé (la question
   *  principale et chacune de ses questions liées). */
  const apply = useCallback((res: DrawResult) => {
    if (res.error) setError(res.error);
    setPrompt(res.prompt);
    setCost(res.cost);
    setFailure(res.failure);
    if (res.failure === 'blocked') {
      setBlockedMinutes(Math.max(1, Math.ceil(((res.blockedUntil ?? 0) - Date.now()) / 60_000)));
    }
    shownAtRef.current = Date.now();
    const slots = 1 + (res.prompt?.parts.length ?? 0);
    setSelected(Array.from({ length: slots }, () => []));
    setFreeText(Array.from({ length: slots }, () => ''));
    setExtra(Array.from({ length: slots }, emptyExtra));
    setOutcomes(Array.from({ length: slots }, () => null));
    setShown(1);
  }, []);

  /** Depuis combien de temps la question est à l'écran. Enveloppé plutôt
   *  qu'appelé sur place : lire l'horloge dans le corps du composant est
   *  signalé comme impur par la règle React Compiler du projet. */
  const elapsedSinceShown = useCallback(() => Date.now() - shownAtRef.current, []);

  const requestDraw = useCallback(
    (remaining: number): Promise<DrawResult> =>
      drawExercise(workshopId, chapterId, remaining, servedRef.current).catch((err) => {
        console.error('drawExercise error:', err);
        return { prompt: null, cost: 0, failure: null, error: DRAW_FAILED };
      }),
    [workshopId, chapterId]
  );

  /** Lance un tirage de plus, à la queue de la file. Ne rend rien quand le
   *  budget est déjà entièrement réservé ou qu'une impasse a été rencontrée :
   *  la file reste vide, et c'est ce vide qui met fin à l'exercice. */
  const enqueue = useCallback((): Promise<void> => {
    chainRef.current = chainRef.current.then(async () => {
      if (failedRef.current) return;
      const room = EXERCISE_BLOOM_BUDGET - committedRef.current;
      if (room <= 0) return;
      const res = await requestDraw(room);
      if (!res.prompt) {
        failedRef.current = res;
        return;
      }
      committedRef.current += res.cost;
      // Retenue dès le TIRAGE et non à l'affichage : avec une question
      // d'avance dans la file, la suivante se tire avant que celle-ci
      // n'apparaisse — la marquer trop tard, c'est risquer de la tirer deux
      // fois de suite.
      servedRef.current = [...servedRef.current, res.prompt.id];
      queueRef.current.push(res);
    });
    return chainRef.current;
  }, [requestDraw]);

  /** La prochaine question prête, ou `null` s'il n'y en a plus. Attend le
   *  tirage en cours : c'est le seul moment où l'écran peut avoir à patienter,
   *  et il ne se produit que si le membre va plus vite que le serveur. */
  const takeNext = useCallback(async (): Promise<DrawResult | null> => {
    await chainRef.current;
    return queueRef.current.shift() ?? null;
  }, []);

  // Au montage : DEUX tirages d'affilée. Le premier s'affiche, le second attend
  // dans la file. C'est ce coup d'avance qui rend le passage à la question
  // suivante instantané même pour qui ne lit pas sa correction — la file se
  // regarnit ensuite à chaque validation, jamais au clic.
  useEffect(() => {
    // ⚠️ **Garde d'exécution unique, et SURTOUT PAS de drapeau d'annulation.**
    //
    // En développement, React monte le composant deux fois : effet, nettoyage,
    // effet. La garde empêche le second passage de tirer quatre questions et de
    // réserver la moitié du budget pour rien — mais elle rend du même coup le
    // motif habituel « `cancelled` dans le nettoyage » **mortel** : le premier
    // passage se voyait annulé par le nettoyage et renonçait à afficher, le
    // second ne faisait rien du tout, et l'écran restait sur « tirage d'une
    // question… » **indéfiniment** (bug introduit avec les deux questions
    // d'avance le 29/08/2026, diagnostiqué le 30).
    //
    // Rien ne remplace ce drapeau, et il n'y a rien à remplacer : le composant
    // du second montage est le MÊME, refs comprises, donc l'affichage tombe au
    // bon endroit. Et sur un vrai démontage, poser un état sur un composant
    // parti ne fait rien du tout depuis React 18 — ni erreur, ni avertissement.
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      await enqueue();
      const first = await takeNext();
      const opening = first ?? failedRef.current ?? { prompt: null, cost: 0, failure: 'empty' as const };
      apply(opening);
      setLoading(false);
      // Une pause en cours ferme l'exercice au lieu de l'ouvrir : le membre doit
      // pouvoir faire autre chose, donc il lui faut la porte de sortie de l'écran
      // de fin, pas un mur.
      if (opening.failure === 'blocked') setDone(true);
      if (first?.prompt) void enqueue();

      // ─── La recharge du chapitre part ICI, et n'est jamais attendue ───────
      //
      // APRÈS l'affichage de la première question, et par un `fetch` ORDINAIRE —
      // ni `after()` côté serveur, ni server action. Les deux ont été essayés le
      // 29/08/2026 et retenaient l'écran de la même façon : `after` n'est détaché
      // que là où l'hébergeur sait le faire, et les appels d'action d'un même
      // onglet sont mis à la queue leu leu par le routeur. Une recharge de deux
      // minutes bloquait donc soit le tirage lui-même, soit tout ce qui vient
      // après. Le pourquoi complet est en tête de la route.
      //
      // `keepalive` : la requête survit à la fermeture de l'onglet, ce que ne
      // fait aucune des deux autres approches.
      //
      // Sans `await` et sans état : ce qu'elle produit servira au prochain
      // exercice, pas à celui-ci. Une panne ne doit rien changer à l'écran — la
      // trace utile est côté serveur.
      if (first?.prompt) {
        void fetch('/api/parcours/refill', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workshopId, chapterId }),
          keepalive: true,
        }).catch(() => {});
      }
    })();
  }, [enqueue, takeNext, apply]);

  /** Question suivante : celle qui attend dans la file. */
  async function handleNext() {
    setError('');
    setTooFast(false);
    setNoMore(false);
    setLoading(true);
    const res = await takeNext();
    setLoading(false);
    if (!res) {
      // Une file vide, c'est la fin de l'exercice — sauf si le dernier tirage
      // s'est heurté à la mise en pause, qui a son propre écran.
      const failed = failedRef.current;
      if (failed) apply(failed);
      setDone(true);
      return;
    }
    apply(res);
  }
  /** Ce qui part au serveur, énoncé par énoncé.
   *
   *  ⚠️ Les paires sont converties en TEXTE : la colonne de droite est arrivée
   *  mélangée et sans index d'origine, un rang dans cette colonne ne voudrait
   *  donc rien dire pour le serveur (voir `ExerciseAnswer.match`). */
  function toAnswers(): ExerciseAnswer[] {
    return statements.map((statement, i) => {
      const ex = extra[i] ?? emptyExtra();
      const right = statement.typeOptions.matchRight ?? [];
      const match: Record<number, string> = {};
      for (const [leftIndex, rightIndex] of Object.entries(ex.match)) {
        const text = right[rightIndex];
        if (text !== undefined) match[Number(leftIndex)] = text;
      }
      return { choices: selected[i] ?? [], text: freeText[i] ?? '', list: ex.list, table: ex.table, match };
    });
  }

  /** Valide l'énoncé actif — et lui seul. Les énoncés déjà corrigés restent
   *  affichés au-dessus ; ceux qui suivent n'ont pas encore été posés, et leur
   *  correction n'est donc pas calculée (voir `gradeExercise`). */
  async function handleValidate() {
    if (!prompt) return;
    const at = activeIndex;
    setChecking(true);
    setError('');
    // `elapsedSinceShown` mesure la grappe ENTIÈRE : elle est remise à zéro à
    // l'affichage de la question, pas à chaque énoncé. Le serveur ne s'en sert
    // qu'au dernier — le rythme se juge sur l'unité qui compte pour une
    // question, pas sur ses morceaux.
    const res = await gradeExercise(workshopId, prompt.id, toAnswers(), at, elapsedSinceShown());
    setChecking(false);
    if (res.error || !res.result) {
      setError(res.error ?? t('gradeError'));
      return;
    }
    const outcome = res.result;
    setOutcomes((prev) => prev.map((v, i) => (i === at ? outcome : v)));
    if (!res.isLast) return;

    // ─── Fin de grappe : c'est ici, et seulement ici, qu'elle compte ────────
    setTooFast(res.tooFast === true);

    // Une grappe vaut UNE question : elle est réussie si aucun de ses énoncés
    // n'est faux et qu'au moins un a pu être corrigé automatiquement (une
    // question entièrement libre ne prouve rien, voir `ExerciseResult`).
    const all = [...outcomes.slice(0, at), outcome];
    if (all.some((o) => o && o.correct !== null) && all.every((o) => !o || o.correct !== false)) {
      setCorrectCount((c) => c + 1);
    }

    // La question consomme son coût dès qu'elle est répondue — juste ou fausse.
    setSpent(spent + cost);

    // Un tirage de plus part MAINTENANT, pendant la lecture de la correction.
    // À la FIN de la grappe et pas à chacun de ses énoncés : le budget est
    // réservé par question, et un tirage par question liée en réserverait
    // autant de fois trop.
    void enqueue().then(() => {
      if (queueRef.current.length === 0) setNoMore(true);
    });
  }

  /** « Suivant » à l'intérieur d'une grappe : découvre l'énoncé d'après, sous
   *  celui qu'on vient de corriger. Rien à demander au serveur — la question
   *  liée est déjà là, elle attendait seulement son tour. */
  function handleNextStatement() {
    setError('');
    setShown((n) => n + 1);
  }

  /** L'énoncé qu'on vient de découvrir arrive SOUS la correction précédente,
   *  donc souvent hors de l'écran quand la première question était longue. On
   *  l'amène sous les yeux — sans quoi « suivant » donnerait l'impression de
   *  n'avoir rien fait. */
  const revealedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (shown > 1) revealedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [shown]);

  /** Avancement de l'exercice : la part du budget déjà consommée. */
  const progressPercent = Math.min(100, Math.round((spent / EXERCISE_BLOOM_BUDGET) * 100));

  /** Énoncés de la grappe, dans l'ordre d'affichage et de correction : la
   *  question principale puis ses questions liées. */
  const statements: ExercisePart[] = prompt
    ? [
        {
          content: prompt.content,
          responseType: prompt.responseType,
          choices: prompt.choices,
          textLines: prompt.textLines,
          typeOptions: prompt.typeOptions,
        },
        ...prompt.parts,
      ]
    : [];

  /** L'énoncé en cours : le dernier découvert. Ceux d'avant sont corrigés et
   *  posés en cartes au-dessus, ceux d'après n'existent pas encore à l'écran. */
  const activeIndex = Math.min(shown, statements.length) - 1;
  /** La correction de l'énoncé actif, une fois validée. */
  const activeOutcome = outcomes[activeIndex] ?? null;
  /** Reste-t-il une question liée après celle qu'on vient de corriger ? */
  const hasNextStatement = activeIndex < statements.length - 1;

  function setChoicesAt(idx: number, next: number[]) {
    setSelected((prev) => prev.map((v, i) => (i === idx ? next : v)));
  }
  function setTextAt(idx: number, next: string) {
    setFreeText((prev) => prev.map((v, i) => (i === idx ? next : v)));
  }
  function setExtraAt(idx: number, patch: Partial<ExtraAnswer>) {
    setExtra((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  // Seul l'énoncé actif est validable : les précédents sont corrigés, les
  // suivants ne sont pas posés. `sans_reponse` reste validable d'emblée — le
  // bouton n'y fait qu'afficher la réponse attendue.
  const canValidate =
    !!prompt && !activeOutcome && !checking &&
    !!statements[activeIndex] &&
    isAnswered(
      statements[activeIndex],
      selected[activeIndex] ?? [],
      freeText[activeIndex] ?? '',
      extra[activeIndex] ?? emptyExtra(),
    );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: palette.cream }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px' }}>
        <Tooltip content={t('back', { workshop: workshopName })}>
          <Link
            href={`/${locale}/workshops/${workshopId}`}
            aria-label={t('back', { workshop: workshopName })}
            style={{ width: 36, height: 36, borderRadius: 12, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, flexShrink: 0 }}
          >
            <X size={16} strokeWidth={1.75} />
          </Link>
        </Tooltip>
        {/* Barre d'avancement de l'exercice (maquette : `exProgressW`). Elle
            avance en niveaux de Bloom consommés, pas en questions : une question
            difficile la fait bondir, c'est le sens même du budget. D'où un
            pourcentage plutôt qu'un « x sur y » qui promettrait un nombre de
            questions que personne ne connaît d'avance. */}
        <Tooltip content={t('progressTitle', { percent: progressPercent })}>
        <div
          style={{ flex: 1, height: 10, borderRadius: radius.pill, background: palette.surfaceSunken, boxShadow: shadow.inset, overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%', borderRadius: radius.pill, background: palette.green,
              width: `${progressPercent}%`,
              transition: 'width 360ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
        </Tooltip>
        {/* Gouttes gagnées dans CETTE session — une par grappe réussie, comme
            l'annonce l'écran de fin. La maquette affiche un total d'arrosoir,
            qui n'existe pas encore côté serveur : afficher le compte de la
            session est la seule valeur vraie dont dispose cet écran. */}
        <Tooltip content={t('dropletsTitle')}>
        <div
          style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: palette.greenBrand, background: withAlpha(palette.green, 0.12), borderRadius: radius.pill, padding: '6px 12px' }}
        >
          <Droplet size={14} strokeWidth={1.75} />
          {correctCount}
        </div>
        </Tooltip>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 40px', display: 'flex' }}>
        {done ? (
          <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 420, padding: '24px 0' }}>
            <div style={{ width: 120, height: 120, borderRadius: radius.pill, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Leaf size={48} strokeWidth={1.5} color={palette.green} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 30, color: palette.greenBrand }}>
              {failure === 'blocked' ? t('blockedTitle') : t('doneTitle')}
            </div>
            <div style={{ fontSize: 14.5, color: palette.inkSoft, marginTop: 10 }}>
              {failure === 'blocked'
                ? t('blockedDesc', { minutes: blockedMinutes })
                : t('doneScore', { count: correctCount })}
            </div>
            <div style={{ marginTop: 28 }}>
              <LinkButton href={`/${locale}/workshops/${workshopId}`} variant="primary" size="lg">
                {t('backToParcours')} <ArrowRight size={16} strokeWidth={1.75} />
              </LinkButton>
            </div>
          </div>
        ) : (
        // `margin: auto` et non `justifyContent: center` : sur un conteneur
        // défilant, le centrage flex rend inatteignable la partie qui dépasse
        // (les navigateurs refusent un défilement négatif). La marge auto, elle,
        // se résout à 0 dès que le contenu est plus haut que la zone — l'énoncé
        // est centré quand il est court, aligné en haut et défilable quand il
        // est long. Voir .claude/rules/frontend-patterns.md.
        <div style={{ maxWidth: 680, margin: 'auto', width: '100%' }}>
          {error && (
            <div style={{ fontSize: 12.5, color: palette.danger, marginBottom: 12 }}>
              {error === DRAW_FAILED ? t('drawError') : error}
            </div>
          )}

          {/* Pas de carte autour de l'énoncé actif : la maquette le pose
              directement sur le fond de la coque. Seuls les énoncés DÉJÀ
              corrigés prennent une carte (voir la pile plus bas), ce qui donne
              au regard le repère « ce qui est fait / ce qui reste ». */}
          <div style={{ paddingTop: 8 }}>
            {loading ? (
              <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 13, color: palette.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> {t('drawing')}
              </div>
            ) : !prompt ? (
              <div style={{ padding: '30px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: palette.ink }}>
                  {failure === 'blocked'
                    ? t('blockedTitle')
                    : failure === 'exhausted'
                      ? t('outOfReachTitle')
                      : t('emptyTitle')}
                </div>
                <div style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 6 }}>
                  {failure === 'blocked'
                    ? t('blockedDesc', { minutes: blockedMinutes })
                    : failure === 'exhausted'
                      ? t('outOfReachDesc')
                      : t('emptyDesc')}
                </div>
              </div>
            ) : (
              <>
                {/* ─── La grappe se dévoile un énoncé à la fois ─────────────
                    Seuls les énoncés déjà découverts sont rendus (`shown`) :
                    le suivant n'apparaît qu'au clic sur « suivant », SOUS le
                    précédent, qui reste lisible avec sa correction. Un énoncé
                    corrigé prend une carte, l'énoncé actif est posé
                    directement sur le fond — c'est le repère « ce qui est
                    fait / ce qui reste ». */}
                {statements.slice(0, shown).map((statement, i) => {
                  const outcome = outcomes[i] ?? null;
                  const isMain = i === 0;
                  const settled = outcome !== null;
                  return (
                    <div
                      key={i}
                      ref={i === shown - 1 ? revealedRef : null}
                      style={{
                        marginTop: isMain ? 0 : 18,
                        ...(settled
                          ? {
                              background: palette.surfaceRaised,
                              border: `1px solid ${palette.line}`,
                              borderRadius: 14,
                              padding: '18px 20px',
                            }
                          : {}),
                      }}
                    >
                      {isMain ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                          <span style={{ width: 44, height: 44, borderRadius: 12, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.green, flexShrink: 0 }}>
                            <Sprout size={20} strokeWidth={1.75} />
                          </span>
                          <span style={{ fontSize: 21, fontWeight: 700, color: palette.ink, lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>
                            {statement.content.trim() || tExam('noStatement')}
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* Une grappe se découvrant une question à la fois,
                              on dit combien il en reste : sans ce repère, le
                              candidat ne sait pas si « suivant » le mène à une
                              question liée de plus ou à une autre question. */}
                          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: palette.inkFaint, marginBottom: 8 }}>
                            {t('statementCounter', { index: i, total: statements.length - 1 })}
                          </div>
                          <div style={{ fontSize: 16.5, fontWeight: 700, color: palette.ink, lineHeight: 1.4, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
                            {statement.content.trim() || tExam('noStatement')}
                          </div>
                        </>
                      )}

                      {/* Image et audio restent avec la question principale :
                          ce sont les éléments COMMUNS de la grappe, et les
                          questions liées s'y réfèrent. Ils ne sont donc jamais
                          répétés, et restent visibles une fois la principale
                          corrigée. */}
                      {isMain && prompt.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier privé (URL signée éphémère), pas un asset next/image
                        <img src={prompt.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12, border: `1px solid ${palette.line}`, marginBottom: 18 }} />
                      )}
                      {isMain && prompt.audioUrl && (
                        <audio controls src={prompt.audioUrl} style={{ width: '100%', marginBottom: 18 }} />
                      )}

                      <AnswerZone
                        statement={statement}
                        selected={selected[i] ?? []}
                        freeText={freeText[i] ?? ''}
                        extra={extra[i] ?? emptyExtra()}
                        result={outcome}
                        onChoices={(next) => setChoicesAt(i, next)}
                        onText={(next) => setTextAt(i, next)}
                        onExtra={(patch) => setExtraAt(i, patch)}
                      />
                    </div>
                  );
                })}

                {tooFast && (
                  <div
                    style={{
                      marginTop: 20,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: withAlpha(palette.amber, 0.14),
                      color: palette.ink,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {t('tooFast')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Bande de décision, ancrée en bas de la coque (maquette : bloc
          `exBandRef`). Elle sort du flux défilant : le bouton reste atteignable
          quel que soit la longueur de l'énoncé — une grille de tableau ou une
          liste de six lignes le repoussait auparavant hors de l'écran. */}
      {!done && prompt && !loading && (
        <div style={{ flex: 'none', borderTop: `1px solid ${palette.line}`, background: palette.surfaceRaised, boxShadow: `0 -8px 24px -12px ${withAlpha(palette.ink, 0.28)}`, padding: '14px 20px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            {/* ─── Un bouton, trois sens, dans cet ordre ────────────────────
                1. valider l'énoncé actif ;
                2. découvrir l'énoncé suivant de la grappe ;
                3. passer à la question suivante — ou terminer, quand il n'y a
                   plus rien à tirer (`noMore`). Il ne doit jamais annoncer une
                   suite qui n'existe pas. */}
            {!activeOutcome ? (
              <Button variant="primary" size="lg" onClick={handleValidate} disabled={!canValidate}>
                {checking && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                {/* « Afficher la réponse » quand l'énoncé actif n'attend rien :
                    le bouton ne valide alors rien, il dévoile. */}
                {statements[activeIndex]?.responseType === 'sans_reponse' ? t('revealAnswer') : t('validate')}
              </Button>
            ) : hasNextStatement ? (
              <Button variant="primary" size="lg" onClick={handleNextStatement}>
                <ArrowRight size={14} strokeWidth={1.75} />
                {t('nextStatement')}
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={noMore ? () => setDone(true) : handleNext}>
                {noMore ? <Leaf size={14} strokeWidth={1.75} /> : <RotateCw size={14} strokeWidth={1.75} />}
                {noMore ? t('finish') : t('next')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Zone de réponse d'UN énoncé : les choix à cocher ou le champ libre, puis sa
 *  correction une fois validé. Le même bloc sert la question principale et
 *  chaque question liée — elles se répondent et se corrigent à l'identique,
 *  seuls les éléments communs (énoncé illustré, audio) ne sont pas répétés.
 *  Définie au niveau module : une fonction composant recréée à chaque rendu
 *  remonterait tout son sous-arbre (et ferait perdre le focus à la saisie). */
function AnswerZone({ statement, selected, freeText, extra, result, onChoices, onText, onExtra }: {
  statement: ExercisePart;
  selected: number[];
  freeText: string;
  extra: ExtraAnswer;
  result: ExerciseResult | null;
  onChoices: (next: number[]) => void;
  onText: (next: string) => void;
  onExtra: (patch: Partial<ExtraAnswer>) => void;
}) {
  const t = useTranslations('exercise');

  const isChoice = statement.responseType === 'qcs' || statement.responseType === 'qcm';
  // Le champ texte n'est plus le repli de tous les types non-QCM : chaque type
  // a désormais sa zone. Il ne sert plus qu'à la réponse rédigée.
  const isFreeText = statement.responseType === 'textuelle';

  function toggleChoice(index: number) {
    if (result) return;
    // QCS : un seul choix — sélectionner remplace. QCM : bascule.
    if (statement.responseType === 'qcs') onChoices([index]);
    else onChoices(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]);
  }

  function choiceStyle(index: number): React.CSSProperties {
    const picked = selected.includes(index);
    const correct = result?.correctChoices.includes(index) ?? false;

    let border: string = palette.lineStrong;
    let background: string = palette.surfaceInput;
    if (result) {
      if (correct) { border = palette.green; background = withAlpha(palette.green, 0.1); }
      else if (picked) { border = palette.danger; background = withAlpha(palette.danger, 0.1); }
    } else if (picked) {
      border = palette.green;
      background = withAlpha(palette.green, 0.08);
    }

    return {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
      textAlign: 'left' as const, padding: '15px 17px', borderRadius: 12, border: `1.5px solid ${border}`,
      background, color: palette.ink, fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
      cursor: result ? 'default' : 'pointer', marginBottom: 9, boxShadow: shadow.sm,
      transition: 'border-color 120ms ease, background 120ms ease',
    };
  }

  const verdictTone =
    result?.correct === true ? palette.green : result?.correct === false ? palette.danger : palette.inkMuted;

  // La « réponse attendue » affichée sous le verdict. Une liste et une mise en
  // paires n'ont rien dans `answer` — leur attendu est structuré : on le remet à
  // plat plutôt que d'inventer une clé de traduction par type. La grille, elle,
  // n'a pas besoin de texte : ses cases justes sont marquées dans la grille
  // elle-même.
  const expectedText =
    result?.answer.trim() ||
    result?.correctList?.join(' · ') ||
    result?.correctPairs?.map((pair) => `${pair.left} → ${pair.right}`).join('\n') ||
    '';

  return (
    <>
      {isChoice && statement.choices.map((choice) => (
        <button key={choice.index} onClick={() => toggleChoice(choice.index)} style={choiceStyle(choice.index)} disabled={!!result}>
          <span style={{ flex: 1 }}>{choice.text}</span>
          {result?.correctChoices.includes(choice.index) && <Check size={18} color={palette.green} />}
          {result && selected.includes(choice.index) && !result.correctChoices.includes(choice.index) && <X size={18} color={palette.danger} />}
        </button>
      ))}

      {isFreeText && (
        <textarea
          value={freeText}
          onChange={(e) => onText(e.target.value)}
          readOnly={!!result}
          rows={statement.textLines}
          placeholder={t('answerPlaceholder')}
          style={{ width: '100%', padding: '13px 15px', borderRadius: 12, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceInput, color: palette.ink, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}

      {statement.responseType === 'liste' && (
        <ListAnswer statement={statement} extra={extra} result={result} onExtra={onExtra} />
      )}
      {statement.responseType === 'tableau' && (
        <TableAnswer statement={statement} extra={extra} result={result} onExtra={onExtra} />
      )}
      {statement.responseType === 'matching' && (
        <MatchAnswer statement={statement} extra={extra} result={result} onExtra={onExtra} />
      )}
      {statement.responseType === 'dessin' && (
        <DrawAnswer extra={extra} readOnly={!!result} onExtra={onExtra} />
      )}
      {statement.responseType === 'fichier' && (
        <FileAnswer statement={statement} extra={extra} readOnly={!!result} onExtra={onExtra} />
      )}

      {result && (
        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, border: `1px solid ${withAlpha(verdictTone, 0.35)}`, background: withAlpha(verdictTone, 0.08) }}>
          {/* Verdict masqué quand il n'y a pas de correction automatique ET
              qu'une réponse attendue est affichée : les deux lignes diraient la
              même chose. */}
          {(result.correct !== null || !expectedText) && (
            <div style={{ fontSize: 13.5, fontWeight: 500, color: verdictTone }}>
              {result.correct === true ? t('verdictCorrect') : result.correct === false ? t('verdictWrong') : t('verdictNeutral')}
            </div>
          )}
          {expectedText && (
            <div style={{ fontSize: 13.5, color: palette.ink, whiteSpace: 'pre-wrap', marginTop: result.correct !== null ? 8 : 0 }}>
              {/* Une attente qui tient sur plusieurs lignes (les paires) prend
                  son propre bloc : à la suite du libellé, sa première ligne
                  serait décalée de toutes les autres. */}
              <span style={{ color: palette.inkFaint, display: expectedText.includes('\n') ? 'block' : 'inline' }}>
                {t('expectedAnswer')}{expectedText.includes('\n') ? '' : ' '}
              </span>
              {expectedText}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Zones de réponse par type ────────────────────────────────────────────────
//
// Un composant par type, tous au niveau module pour la même raison qu'
// `AnswerZone` : recréés à chaque rendu du parent, ils remonteraient leur
// sous-arbre et feraient perdre le focus à la saisie en cours.
//
// Trois d'entre elles sont CORRIGÉES depuis le 25/08/2026 — la liste, la grille
// et les paires. Elles reçoivent donc le résultat au lieu d'un simple booléen de
// verrouillage : c'est lui qui colore chaque champ, chaque case et chaque trait.
// Le dessin et le dépôt de fichier gardent leur `readOnly` : rien ne les juge.
//
// La règle de comparaison des textes est celle du serveur, importée telle quelle
// (`answerMatch`) : deux lectures différentes afficheraient un champ vert sous un
// verdict « faux ».

/** liste — autant de champs que la question attend de réponses. */
function ListAnswer({ statement, extra, result, onExtra }: {
  statement: ExercisePart;
  extra: ExtraAnswer;
  result: ExerciseResult | null;
  onExtra: (patch: Partial<ExtraAnswer>) => void;
}) {
  const t = useTranslations('exercise');
  const readOnly = !!result;
  const rows = listRowCount(statement);
  // Quelles saisies ont trouvé preneur, dans l'ordre des champs. Appariement UN
  // POUR UN : la même réponse écrite deux fois ne vaut qu'une fois.
  const hits = result?.correctList ? matchListEntries(
    Array.from({ length: rows }, (_, i) => extra.list[i] ?? ''),
    result.correctList,
  ) : [];

  /** Couleur d'un champ après validation : vert s'il a trouvé sa réponse,
   *  rouge s'il porte du texte qui ne correspond à rien. Un champ laissé VIDE
   *  reste neutre — il n'y a rien à sanctionner dans une case qu'on n'a pas
   *  remplie, le verdict global le dit déjà. */
  function entryTone(row: number): string | null {
    if (!result?.correctList) return null;
    if (hits[row] !== null && hits[row] !== undefined) return palette.green;
    return (extra.list[row] ?? '').trim() ? palette.danger : null;
  }
  // Numérotation activée par défaut : sans réglage explicite, une liste se lit
  // numérotée (c'est le cas de la maquette).
  const numbered = statement.typeOptions.listNumbered ?? true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {numbered && (
            <span style={{ flex: 'none', width: 20, fontSize: 14, fontWeight: 700, color: palette.inkFaint }}>
              {row + 1}
            </span>
          )}
          <input
            value={extra.list[row] ?? ''}
            onChange={(e) => {
              // On repart d'un tableau de la bonne longueur : `extra.list` est
              // vide au premier rendu, une écriture directe à l'index laisserait
              // des trous.
              const next = Array.from({ length: rows }, (_, i) => extra.list[i] ?? '');
              next[row] = e.target.value;
              onExtra({ list: next });
            }}
            readOnly={readOnly}
            placeholder={t('answerPlaceholder')}
            style={{
              flex: 1, minWidth: 0, padding: '13px 15px', borderRadius: 12,
              border: `1.5px solid ${entryTone(row) ?? palette.lineStrong}`,
              background: entryTone(row) ? withAlpha(entryTone(row) as string, 0.1) : palette.surfaceInput,
              color: palette.ink, fontSize: 15, fontFamily: 'inherit', boxShadow: shadow.sm, boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** tableau — grille à cocher, une case par croisement ligne/colonne. */
function TableAnswer({ statement, extra, result, onExtra }: {
  statement: ExercisePart;
  extra: ExtraAnswer;
  result: ExerciseResult | null;
  onExtra: (patch: Partial<ExtraAnswer>) => void;
}) {
  const readOnly = !!result;
  // Les cases justes n'arrivent qu'APRÈS validation : elles ne voyagent jamais
  // avec l'énoncé (`tableChecked` est exclu de ce qu'on envoie au candidat).
  const solution = result?.correctTable ?? null;
  const rows = statement.typeOptions.tableRows ?? [];
  const cols = statement.typeOptions.tableCols ?? [];
  // `tableUnique` : une seule case par LIGNE (comportement « radio »).
  const unique = statement.typeOptions.tableUnique ?? false;
  const template = `minmax(0,1.4fr) repeat(${Math.max(cols.length, 1)}, minmax(0,1fr))`;

  function toggle(key: string, rowIndex: number) {
    if (readOnly) return;
    const has = extra.table.includes(key);
    if (unique) {
      // Une seule case par ligne : on retire les autres cases de CETTE ligne.
      const others = extra.table.filter((k) => !k.startsWith(`${rowIndex}-`));
      onExtra({ table: has ? others : [...others, key] });
      return;
    }
    onExtra({ table: has ? extra.table.filter((k) => k !== key) : [...extra.table, key] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: template, gap: 8, alignItems: 'center' }}>
        <span />
        {cols.map((col, i) => (
          <span key={i} style={{ textAlign: 'center', fontSize: 14.5, fontWeight: 600, color: palette.inkMuted }}>{col}</span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: template, gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: palette.ink }}>{row}</span>
          {cols.map((_, colIndex) => {
            const key = tableCellKey(rowIndex, colIndex);
            const checked = extra.table.includes(key);
            // Après validation, c'est la SOLUTION qui commande la couleur : une
            // case juste passe au vert qu'elle ait été cochée ou non (le
            // candidat doit voir ce qu'il a manqué), et une case cochée à tort
            // passe au rouge.
            const expected = solution?.includes(key) ?? false;
            const tone = solution
              ? expected ? palette.green : checked ? palette.danger : null
              : checked ? palette.green : null;
            return (
              <button
                key={colIndex}
                onClick={() => toggle(key, rowIndex)}
                disabled={readOnly}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0',
                  borderRadius: 12, border: `1.5px solid ${tone ?? palette.lineStrong}`,
                  background: tone ? withAlpha(tone, 0.1) : palette.surfaceInput,
                  cursor: readOnly ? 'default' : 'pointer', boxShadow: shadow.sm,
                  transition: 'border-color 120ms ease, background 120ms ease',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: unique ? 999 : 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${tone ?? palette.lineStrong}`,
                  background: checked ? (tone ?? palette.green) : 'transparent',
                }}>
                  {checked && <Check size={13} color={palette.onGreen} strokeWidth={3} />}
                  {/* Case juste que le candidat n'a pas cochée : le contour vert
                      seul se confondrait avec une case simplement cochable. */}
                  {!checked && expected && <Check size={13} color={palette.green} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** matching — on touche deux éléments pour les relier, dans n'importe quel
 *  ordre et depuis n'importe quel côté ; recliquer un encadré DÉJÀ RELIÉ le
 *  délie. Les deux colonnes obéissent exactement à la même règle : c'est ce
 *  qu'annonce la consigne affichée sous la grille, et rien dans l'interface ne
 *  doit donc être inerte au clic.
 *
 *  La colonne de droite arrive mélangée et détachée de la gauche (voir
 *  `matchRight` dans examTypes) : rien ici ne trahit l'appariement attendu.
 *
 *  L'association est matérialisée par un trait tracé en SVG dans la gouttière
 *  centrale, d'une pastille à l'autre. */
function MatchAnswer({ statement, extra, result, onExtra }: {
  statement: ExercisePart;
  extra: ExtraAnswer;
  result: ExerciseResult | null;
  onExtra: (patch: Partial<ExtraAnswer>) => void;
}) {
  const t = useTranslations('exercise');
  const readOnly = !!result;
  // L'élément en attente porte SON CÔTÉ : une paire se commence indifféremment
  // à gauche ou à droite (« touche 2 éléments pour les relier »). Un simple
  // index ne suffisait pas — il obligeait à toujours partir de la gauche.
  const [pending, setPending] = useState<{ side: 'left' | 'right'; index: number } | null>(null);
  const left = statement.choices;
  const right = statement.typeOptions.matchRight ?? [];
  const split = Math.min(Math.max(statement.typeOptions.matchSplit ?? 0.5, 0.1), 0.9);

  /** Index de gauche apparié à cette correspondance, s'il y en a un. */
  function leftPairedTo(rightIndex: number): number | null {
    const entry = Object.entries(extra.match).find(([, r]) => r === rightIndex);
    return entry ? Number(entry[0]) : null;
  }

  /** Défait la paire portée par cet index de gauche. */
  function unlink(leftIndex: number) {
    const next = { ...extra.match };
    delete next[leftIndex];
    onExtra({ match: next });
    setPending(null);
  }

  /** Relie les deux côtés. Une correspondance ne sert qu'une fois : sa paire
   *  précédente est libérée, sans quoi deux éléments de gauche pointeraient sur
   *  la même. */
  function link(leftIndex: number, rightIndex: number) {
    const next: Record<number, number> = {};
    for (const [l, r] of Object.entries(extra.match)) {
      if (r !== rightIndex && Number(l) !== leftIndex) next[Number(l)] = r;
    }
    next[leftIndex] = rightIndex;
    onExtra({ match: next });
    setPending(null);
  }

  // Les deux côtés obéissent à la même règle, dans cet ordre : un encadré DÉJÀ
  // RELIÉ se délie, sinon il se relie à l'élément en attente d'en face, sinon
  // il devient lui-même l'élément en attente.
  function pickLeft(index: number) {
    if (readOnly) return;
    if (extra.match[index] !== undefined) return unlink(index);
    if (pending?.side === 'right') return link(index, pending.index);
    setPending(pending?.side === 'left' && pending.index === index ? null : { side: 'left', index });
  }

  function pickRight(index: number) {
    if (readOnly) return;
    // Délier depuis la droite : la paire est stockée par index de GAUCHE, il
    // faut donc remonter à celui qui pointe sur cette correspondance.
    const pairedLeft = leftPairedTo(index);
    if (pairedLeft !== null) return unlink(pairedLeft);
    if (pending?.side === 'left') return link(pending.index, index);
    setPending(pending?.side === 'right' && pending.index === index ? null : { side: 'right', index });
  }

  // Les tirets ne sont PAS un état permanent d'une colonne : ils désignent les
  // cibles atteignables pendant une sélection. Tant que rien n'est en attente,
  // tout reste en trait plein — rien n'est « à prendre ».
  function sideStyle(active: boolean, paired: boolean, dashed: boolean, tone?: string | null): React.CSSProperties {
    return {
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      textAlign: 'left', padding: '13px 15px', borderRadius: 12,
      border: `1.5px ${dashed ? 'dashed' : 'solid'} ${tone ?? (active ? palette.green : paired ? withAlpha(palette.green, 0.5) : dashed ? withAlpha(palette.green, 0.45) : palette.lineStrong)}`,
      background: tone ? withAlpha(tone, 0.1) : active ? withAlpha(palette.green, 0.12) : paired ? withAlpha(palette.green, 0.06) : palette.surfaceInput,
      color: palette.ink, fontSize: 14.5, fontWeight: 600, fontFamily: 'inherit',
      cursor: readOnly ? 'default' : 'pointer', boxShadow: shadow.sm,
      transition: 'border-color 120ms ease, background 120ms ease',
    };
  }

  // ── Où partent les traits : mesuré, et non plus déduit du rang ───────────
  //
  // Un encadré dont le libellé revient à la ligne est plus haut que ses
  // voisins : le rang ne dit alors plus où tombe son milieu, et le trait
  // partait au-dessus ou en dessous de la pastille (constaté le 30/08/2026).
  // On mesure donc le centre RÉEL de chaque encadré, dans le repère de la
  // gouttière, et le SVG travaille en pixels — pas de `viewBox` étiré, donc
  // pas d'hypothèse sur des lignes de hauteur égale.
  //
  // La mesure re-tourne à chaque rendu et sur tout changement de taille (le
  // `ResizeObserver` reste branché : une fenêtre redimensionnée fait
  // re-répartir les retours à la ligne). Elle est gardée par une comparaison,
  // sans quoi chaque mesure redéclencherait un rendu, donc une mesure.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [geom, setGeom] = useState<{ width: number; leftY: number[]; rightY: number[] }>({ width: 0, leftY: [], rightY: [] });

  const measure = useCallback(() => {
    const gutter = gutterRef.current;
    if (!gutter) return;
    const base = gutter.getBoundingClientRect();
    // Tout en coordonnées de la fenêtre : on ne mélange jamais un
    // `getBoundingClientRect` et un `offsetHeight` dans un même calcul
    // (cf. .claude/rules/frontend-patterns.md).
    const centers = (els: (HTMLButtonElement | null)[]) =>
      els.map((el) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 - base.top;
      });
    const next = { width: base.width, leftY: centers(leftRefs.current), rightY: centers(rightRefs.current) };
    setGeom((prev) => {
      const same =
        prev.width === next.width &&
        prev.leftY.length === next.leftY.length &&
        prev.rightY.length === next.rightY.length &&
        prev.leftY.every((v, i) => v === next.leftY[i]) &&
        prev.rightY.every((v, i) => v === next.rightY[i]);
      return same ? prev : next;
    });
  }, []);

  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [measure]);

  /** Pastille d'accroche, sur le bord intérieur de l'encadré : pleine dès que
   *  l'élément est relié ou sélectionné, creuse sinon. C'est elle que le trait
   *  vient rejoindre. */
  function dot(on: boolean) {
    return (
      <span style={{ flex: 'none', width: 11, height: 11, borderRadius: 999, border: `1.5px solid ${on ? palette.green : palette.lineStrong}`, background: on ? palette.green : 'transparent', transition: 'background 120ms ease, border-color 120ms ease' }} />
    );
  }

  // Côté où se trouvent les cibles de la sélection en cours : c'est l'AUTRE
  // colonne que celle de l'élément en attente. Ses encadrés encore libres se
  // mettent en pointillé pour montrer où le trait peut aboutir ; un encadré
  // déjà relié n'en fait pas partie (le recliquer le délie, ça ne le prend pas).
  const targetSide: 'left' | 'right' | null =
    pending === null ? null : pending.side === 'left' ? 'right' : 'left';

  /** Couleur d'un appariement après validation : vert s'il est juste, rouge
   *  sinon. `null` tant que rien n'est validé — la correction ne descend jamais
   *  avant.
   *
   *  Comparaison de textes **exacte**, identique à celle du serveur (`gradeStatement`) :
   *  le candidat n'écrit rien ici, le libellé est simplement l'identifiant de
   *  l'encadré qu'il a relié — la colonne de droite est arrivée mélangée et son
   *  rang ne dit rien de l'appariement attendu. Toute tolérance de forme
   *  colorerait en vert un encadré différent au libellé voisin. */
  function pairTone(leftIndex: number, rightIndex: number): string | null {
    const pairs = result?.correctPairs;
    if (!pairs) return null;
    return (right[rightIndex] ?? '').trim() === (pairs[leftIndex]?.right ?? '') ? palette.green : palette.danger;
  }

  const links = Object.entries(extra.match).map(([l, r]) => {
    const leftRow = left.findIndex((c) => c.index === Number(l));
    const y1 = geom.leftY[leftRow] ?? 0;
    const y2 = geom.rightY[r] ?? 0;
    const w = geom.width;
    return {
      key: `${l}-${r}`,
      d: `M 0 ${y1} C ${w / 2} ${y1}, ${w / 2} ${y2}, ${w} ${y2}`,
      stroke: pairTone(Number(l), r) ?? palette.green,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Les deux colonnes sont CENTRÉES l'une sur l'autre (`justifyContent`) :
          celle qui a des encadrés sur deux lignes est plus haute, elle
          commence donc plus haut et finit plus bas que l'autre, au lieu de
          s'aligner par le sommet et de faire pencher toute la grille. */}
      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `${split}fr 54px ${1 - split}fr`, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          {left.map((choice, row) => {
            const active = pending?.side === 'left' && pending.index === choice.index;
            const linked = extra.match[choice.index];
            const paired = linked !== undefined;
            const tone = paired ? pairTone(choice.index, linked) : null;
            return (
              <button key={choice.index} ref={(el) => { leftRefs.current[row] = el; }} onClick={() => pickLeft(choice.index)} disabled={readOnly} style={sideStyle(active, paired, targetSide === 'left' && !paired, tone)}>
                <span style={{ flex: 1, minWidth: 0 }}>{choice.text}</span>
                {dot(active || paired)}
              </button>
            );
          })}
        </div>

        {/* Gouttière des traits. `overflow: visible` : une courbe entre deux
            lignes très écartées déborde du cadre, et serait rognée sinon. */}
        <div ref={gutterRef} style={{ position: 'relative' }}>
          {/* Pas de `viewBox` : le repère du SVG est celui des pixels de la
              gouttière, donc les centres mesurés s'y posent tels quels. */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
            {links.map((link) => (
              <path key={link.key} d={link.d} fill="none" stroke={link.stroke} strokeWidth={2} strokeLinecap="round" />
            ))}
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          {right.map((label, index) => {
            const active = pending?.side === 'right' && pending.index === index;
            const pairedLeft = leftPairedTo(index);
            const paired = pairedLeft !== null;
            const tone = pairedLeft !== null ? pairTone(pairedLeft, index) : null;
            return (
              <button key={index} ref={(el) => { rightRefs.current[index] = el; }} onClick={() => pickRight(index)} disabled={readOnly} style={sideStyle(active, paired, targetSide === 'right' && !paired, tone)}>
                {dot(active || paired)}
                <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <span style={{ fontSize: 12, color: palette.inkFaint }}>{t('matchHint')}</span>
    </div>
  );
}

/** dessin — tracé libre à la souris ou au doigt, en coordonnées 0-100 pour
 *  rester indépendant de la taille réelle du cadre. */
function DrawAnswer({ extra, readOnly, onExtra }: {
  extra: ExtraAnswer;
  readOnly: boolean;
  onExtra: (patch: Partial<ExtraAnswer>) => void;
}) {
  const t = useTranslations('exercise');
  const [drawing, setDrawing] = useState(false);

  function pointAt(e: React.PointerEvent<HTMLDivElement>): string {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }

  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    setDrawing(true);
    onExtra({ strokes: [...extra.strokes, pointAt(e)] });
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly || !drawing) return;
    const strokes = [...extra.strokes];
    strokes[strokes.length - 1] = `${strokes[strokes.length - 1]} ${pointAt(e)}`;
    onExtra({ strokes });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => setDrawing(false)}
        onPointerLeave={() => setDrawing(false)}
        style={{ position: 'relative', height: 260, borderRadius: 12, border: `1.5px dashed ${palette.lineStrong}`, background: palette.surfaceRaised, cursor: readOnly ? 'default' : 'crosshair', touchAction: 'none', overflow: 'hidden' }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {extra.strokes.map((points, i) => (
            <polyline key={i} points={points} fill="none" stroke={palette.ink} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: palette.inkFaint }}>{t('drawHint')}</span>
        {extra.strokes.length > 0 && !readOnly && (
          <button
            onClick={() => onExtra({ strokes: [] })}
            style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: palette.inkMuted, background: palette.surfaceInput, border: `1px solid ${palette.lineStrong}`, borderRadius: 999, padding: '6px 12px' }}
          >
            {t('drawClear')}
          </button>
        )}
      </div>
    </div>
  );
}

/** fichier — le dépôt réel n'est pas branché : on retient le nom choisi pour
 *  que l'énoncé soit validable, l'envoi vers le stockage restant à faire
 *  (`storage.ts`, même chemin que les pièces jointes d'énoncé). */
function FileAnswer({ statement, extra, readOnly, onExtra }: {
  statement: ExercisePart;
  extra: ExtraAnswer;
  readOnly: boolean;
  onExtra: (patch: Partial<ExtraAnswer>) => void;
}) {
  const t = useTranslations('exercise');
  const accept = (statement.typeOptions.fileTypes ?? []).join(', ');

  // La zone de dépôt reste montée en permanence, y compris une fois un fichier
  // choisi : elle sert alors à le REMPLACER. La masquer obligeait à retirer le
  // fichier d'abord pour pouvoir en déposer un autre — un aller-retour inutile,
  // et rien n'indiquait que le remplacement était possible.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ cursor: readOnly ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: 150, border: `1.5px dashed ${palette.lineStrong}`, borderRadius: 12, color: palette.inkMuted }}>
        <Upload size={24} color={palette.tanStrong} strokeWidth={1.75} />
        <span style={{ fontSize: 14.5, fontWeight: 600, color: palette.ink }}>{t('fileDrop')}</span>
        {accept && <span style={{ fontSize: 12, color: palette.inkFaint }}>{accept}</span>}
        <input
          type="file"
          disabled={readOnly}
          // `value` remis à zéro : sans ça, redéposer le MÊME fichier ne
          // déclenche pas `change` (la valeur de l'input n'a pas varié) et le
          // remplacement passerait pour un clic sans effet.
          onChange={(e) => {
            onExtra({ fileName: e.target.files?.[0]?.name ?? '' });
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </label>

      {extra.fileName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${palette.green}`, background: withAlpha(palette.green, 0.1), borderRadius: 12, padding: '14px 16px' }}>
          <FileText size={20} color={palette.green} strokeWidth={1.75} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: palette.green, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {extra.fileName}
          </span>
          {!readOnly && (
            <button
              onClick={() => onExtra({ fileName: '' })}
              aria-label={t('fileRemove')}
              style={{ flex: 'none', width: 28, height: 28, borderRadius: 999, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, padding: 0 }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
