// Vue « groupe de questions » — la forme SYMÉTRIQUE du modèle de question, et
// le contrat exposé à l'extérieur de l'application (génération par IA, future
// API publique).
//
// ─── Pourquoi ce fichier existe ──────────────────────────────────────────────
//
// Ce qu'un utilisateur (et un modèle de langage) manipule, c'est un GROUPE :
// une image, un audio et des libellés facultatifs, communs, puis une LISTE DE
// QUESTIONS — au moins une, toutes de même nature.
//
//   { image, audio, labels, questions: [ {…}, {…}, {…} ] }
//
// Le stockage, lui, est asymétrique : la première question vit dans les
// colonnes de la ligne `exam_questions`, les suivantes dans le tableau jsonb
// `parts` (voir `QuestionPart` dans examTypes.ts). Cette asymétrie est un
// détail d'implémentation, et elle est un piège pour une IA à qui il faudrait
// expliquer « la première question à la racine, les autres dans `parts` » —
// règle qu'un modèle enfreint régulièrement (trois questions dans `parts` et un
// énoncé principal vide).
//
// `toGroup`/`fromGroup` isolent ce détail. Tout ce qui parle au monde extérieur
// parle `QuestionGroup` ; seul `exam.ts` connaît la forme réellement stockée.
// Conséquence recherchée : le jour où le stockage devient symétrique lui aussi
// (table enfant `exam_question_items`, voir docs/backlog.md), le changement ne
// touche que la conversion — ni l'UI, ni la génération, ni l'API.
//
// ─── Invariant ───────────────────────────────────────────────────────────────
//
// Un groupe a TOUJOURS au moins une question. `fromGroup` refuse un tableau
// vide plutôt que de fabriquer une question fantôme : un groupe sans question
// n'a pas de sens et ne doit jamais atteindre la base.

import {
  DEFAULT_BLOOM_LEVEL,
  toBloomLevel,
  toResponseType,
  type BloomLevel,
  type Question,
  type QuestionMedia,
  type QuestionPart,
  type QuestionTypeOptions,
  type ResponseType,
} from '@/lib/workshops/examTypes';

// Une question du groupe. Strictement les mêmes champs pour la première et les
// suivantes — c'est tout l'intérêt de cette vue.
export type QuestionItem = {
  /** Identifiant stable, utilisé comme clé de barème (`ExamConfig.weighting`)
   *  et, à terme, comme clé de la jonction notions. Aujourd'hui dérivé de la
   *  position (voir `itemIdOf`) puisque les questions liées n'en ont pas encore
   *  en propre ; une IA n'a jamais à le fournir (`fromGroup` le recalcule). */
  id: string;
  content: string;
  responseType: ResponseType;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  textLines: number;
  typeOptions: QuestionTypeOptions;
  expectations: string;
  bloomLevel: BloomLevel;
  notionIds: string[];
};

// Les éléments COMMUNS du groupe + ses questions. Rien ici n'est propre à un
// énoncé : c'est exactement la ligne de partage de l'éditeur (image, audio et
// libellés saisis une seule fois, voir `QuestionPart`).
export type QuestionGroup = {
  id: string;
  title: string;
  image?: QuestionMedia | null;
  audio?: QuestionMedia | null;
  /** Libellés d'examen (`exam_pools`) — communs à tout le groupe. */
  pools: string[];
  examIds: string[];
  /** Chapitre de rattachement, pour les groupes du parcours pédagogique. */
  chapterId?: string | null;
  createdAt?: string;
  /** Au moins une. `questions[0]` est la question principale de la copie. */
  questions: QuestionItem[];
};

/** Identifiant d'une question dans son groupe. La première reprend celui du
 *  groupe (c'est aussi ce que fait le stockage, voir `exam.ts` — les clés de
 *  barème et les sections d'examen restent ainsi valides) ; les suivantes ont le
 *  leur, stable d'une édition à l'autre. */
export function itemIdOf(groupId: string, index: number, existing?: string): string {
  if (index === 0) return groupId;
  return existing && existing !== groupId ? existing : crypto.randomUUID();
}

/** Forme stockée → forme exposée. */
export function toGroup(q: Question): QuestionGroup {
  const head: QuestionItem = {
    id: itemIdOf(q.id, 0),
    content: q.content,
    responseType: q.responseType,
    answer: q.answer,
    choices: q.choices ?? [],
    correctChoices: q.correctChoices ?? [],
    shuffleChoices: q.shuffleChoices ?? false,
    textLines: q.textLines ?? 4,
    typeOptions: q.typeOptions ?? {},
    expectations: q.expectations ?? '',
    bloomLevel: q.bloomLevel ?? DEFAULT_BLOOM_LEVEL,
    notionIds: q.notionIds ?? [],
  };
  const linked: QuestionItem[] = (q.parts ?? []).map((part, i) => ({
    id: itemIdOf(q.id, i + 1, part.id),
    content: part.content,
    responseType: part.responseType,
    answer: part.answer,
    choices: part.choices ?? [],
    correctChoices: part.correctChoices ?? [],
    shuffleChoices: part.shuffleChoices ?? false,
    textLines: part.textLines ?? 4,
    typeOptions: part.typeOptions ?? {},
    expectations: part.expectations ?? '',
    bloomLevel: part.bloomLevel ?? DEFAULT_BLOOM_LEVEL,
    notionIds: part.notionIds ?? [],
  }));

  return {
    id: q.id,
    title: q.title ?? '',
    image: q.image ?? null,
    audio: q.audio ?? null,
    pools: q.pools ?? [],
    examIds: q.examIds ?? [],
    chapterId: q.chapterId ?? null,
    createdAt: q.createdAt,
    questions: [head, ...linked],
  };
}

/** Forme exposée → forme stockée. Lève si le groupe est vide (voir l'invariant
 *  en tête de fichier) : mieux vaut un refus net qu'une question fantôme
 *  enregistrée en base. */
export function fromGroup(group: QuestionGroup): Question {
  const [head, ...linked] = group.questions;
  if (!head) throw new Error('QuestionGroup: au moins une question est requise');

  return {
    id: group.id,
    title: group.title ?? '',
    image: group.image ?? null,
    audio: group.audio ?? null,
    pools: group.pools ?? [],
    examIds: group.examIds ?? [],
    chapterId: group.chapterId ?? null,
    createdAt: group.createdAt,

    content: head.content,
    responseType: head.responseType,
    answer: head.answer,
    choices: head.choices,
    correctChoices: head.correctChoices,
    shuffleChoices: head.shuffleChoices,
    textLines: head.textLines,
    typeOptions: head.typeOptions,
    expectations: head.expectations,
    bloomLevel: head.bloomLevel,
    notionIds: head.notionIds,

    parts: linked.map((item) => ({
      id: item.id,
      content: item.content,
      responseType: item.responseType,
      answer: item.answer,
      choices: item.choices,
      correctChoices: item.correctChoices,
      shuffleChoices: item.shuffleChoices,
      textLines: item.textLines,
      typeOptions: item.typeOptions,
      expectations: item.expectations,
      bloomLevel: item.bloomLevel,
      notionIds: item.notionIds,
    })) satisfies QuestionPart[],

    // Champs hérités que la vue « groupe » n'expose pas : ils ne sont plus
    // édités nulle part et disparaîtront avec le passage au stockage
    // symétrique. Valeurs neutres, jamais lues.
    answerOptional: false,
    difficulty: { enabled: false, value: 3 },
    duration: { enabled: false, minutes: 2, seconds: 0 },
  };
}

// ─── Entrée non fiable (IA, import, API) ─────────────────────────────────────
//
// Ce que produit un modèle de langage n'est jamais garanti : type de réponse
// inventé, niveau de Bloom hors bornes, champs absents. `normalizeGroupInput`
// ramène n'importe quel objet sur un `QuestionGroup` valide plutôt que de faire
// confiance — même philosophie que `toResponseType`/`toBloomLevel`, appliquée à
// l'objet entier. Les identifiants sont recalculés : une IA n'a pas à les
// fournir, et ne doit pas pouvoir en imposer.

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}
function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)) : [];
}

function normalizeItem(raw: unknown, groupId: string, index: number): QuestionItem {
  const r = asRecord(raw);
  return {
    id: itemIdOf(groupId, index, typeof r.id === 'string' ? r.id : undefined),
    content: asString(r.content),
    responseType: toResponseType(r.responseType),
    answer: asString(r.answer),
    choices: asStringArray(r.choices),
    correctChoices: asNumberArray(r.correctChoices),
    shuffleChoices: r.shuffleChoices === true,
    textLines: typeof r.textLines === 'number' && r.textLines >= 1 ? Math.round(r.textLines) : 4,
    typeOptions: (r.typeOptions && typeof r.typeOptions === 'object' ? r.typeOptions : {}) as QuestionTypeOptions,
    expectations: asString(r.expectations),
    bloomLevel: toBloomLevel(r.bloomLevel),
    notionIds: asStringArray(r.notionIds),
  };
}

/** `id` est imposé par l'appelant (jamais par la source) ; un groupe sans
 *  question exploitable en reçoit une vide plutôt que de faire échouer tout un
 *  lot de génération. */
export function normalizeGroupInput(raw: unknown, id: string): QuestionGroup {
  const r = asRecord(raw);
  const rawQuestions = Array.isArray(r.questions) ? r.questions : [];
  const questions = (rawQuestions.length > 0 ? rawQuestions : [{}]).map((item, i) => normalizeItem(item, id, i));

  const image = asRecord(r.image);
  const audio = asRecord(r.audio);

  return {
    id,
    title: asString(r.title),
    // Une IA ne dépose pas de fichier : elle ne peut fournir qu'une clé de
    // stockage déjà connue, sinon la pièce jointe est ignorée.
    image: typeof image.key === 'string' ? { key: image.key } : null,
    audio: typeof audio.key === 'string' ? { key: audio.key } : null,
    pools: asStringArray(r.pools),
    examIds: [],
    chapterId: typeof r.chapterId === 'string' ? r.chapterId : null,
    questions,
  };
}
