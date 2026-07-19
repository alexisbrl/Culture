// Types de domaine du générateur d'examen (audit §5.3) : question, brique de
// réponse, configuration d'examen généré, pool de questions. Avant ce fichier,
// ces types étaient définis dans des composants UI (QuestionEditor.tsx,
// examen/examShared.tsx) et importés par les server actions
// (src/app/actions/examQuestions.ts) — une dépendance à l'envers qui empêchait
// de réutiliser la logique métier sans traîner tout le composant. Ce fichier
// est la source de vérité ; l'UI et les server actions le consomment.
//
// `QuestionEditor.tsx` et `examen/examShared.tsx` ré-exportent ces types
// (parfois sous un alias historique : `Pool` = `ExamPool`, `Exam` =
// `GeneratedExam`) pour ne pas casser leurs très nombreux consommateurs
// internes (BankContent, GeneratorContent, HistoryContent) — ne pas dupliquer
// ces définitions ailleurs, toujours les faire dériver d'ici.

export type QuestionType = 'textuel' | 'visuel' | 'audio';

// Une question vit soit dans la banque d'examen, soit dans le parcours
// pédagogique (colonne `exam_questions.context`). Même table, même éditeur,
// deux surfaces de gestion distinctes.
export type QuestionContext = 'exam' | 'parcours';

export type ResponseType =
  | 'sans_reponse'
  | 'qcs'
  | 'qcm'
  | 'textuelle'
  | 'dessin'
  | 'audio'
  | 'sondage'
  | 'fill_blank'
  | 'matching'
  | 'ordre';

// Taxonomie de Bloom — niveau cognitif VISÉ par la question (1 mémoriser,
// 2 comprendre, 3 appliquer, 4 analyser, 5 évaluer, 6 créer). À ne pas confondre
// avec `brick_mastery.bloom_level`, qui mesure le niveau ATTEINT par un candidat
// sur une brique. Obligatoire : jamais nul, jamais absent, 1 par défaut — la
// contrainte `exam_questions_bloom_level_check` le garantit jusqu'en base.
export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const BLOOM_LEVELS: BloomLevel[] = [1, 2, 3, 4, 5, 6];

export const DEFAULT_BLOOM_LEVEL: BloomLevel = 1;

/** Ramène n'importe quelle entrée (null, undefined, valeur hors bornes) sur un niveau valide. */
export function toBloomLevel(value: unknown): BloomLevel {
  const n = Number(value);
  return BLOOM_LEVELS.includes(n as BloomLevel) ? (n as BloomLevel) : DEFAULT_BLOOM_LEVEL;
}

export type QuestionPart = {
  content: string;
  responseType: ResponseType;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  textLines: number;
  answerOptional: boolean;
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number; seconds: number };
};

export type Question = {
  id: string;
  title: string;
  questionType: QuestionType;
  responseType: ResponseType;
  content: string;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  pools: string[];
  answerOptional: boolean;
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number; seconds: number };
  parts: QuestionPart[];
  examIds: string[];
  createdAt?: string;
  textLines?: number;
  // Chapitre de rattachement — utilisé uniquement par les questions du parcours
  // (`context = 'parcours'`), où il détermine dans quel pot la question peut
  // être tirée. Toujours `null` côté banque d'examen.
  chapterId?: string | null;
  // Niveau de Bloom visé. Non optionnel : toute construction d'une Question doit
  // le fournir (emptyQuestion() met 1), pour qu'il soit impossible d'aboutir en
  // base sans valeur.
  bloomLevel: BloomLevel;
  // Briques de connaissance couvertes par la question (table de jonction
  // `exam_question_bricks`, N-N, sans restriction de chapitre).
  brickIds: string[];
};

// ─── Exercice du parcours ────────────────────────────────────────────────────
//
// ⚠️ Ce qu'un candidat reçoit quand il lance un exercice : volontairement PAS un
// `Question`. Ni `answer` ni `correctChoices` n'en font partie — la correction
// est calculée côté serveur (`gradeParcoursAnswer`) et la réponse attendue n'est
// renvoyée qu'après validation.
export type ExerciseChoice = {
  // Index de l'option dans la question d'origine : c'est lui que le client
  // renvoie à la validation, ce qui permet de mélanger l'ordre d'affichage sans
  // que le serveur ait à mémoriser la permutation. Ne révèle rien.
  index: number;
  text: string;
};

export type ExercisePrompt = {
  id: string;
  title: string;
  content: string;
  questionType: QuestionType;
  responseType: ResponseType;
  choices: ExerciseChoice[];
  textLines: number;
};

export type ExerciseResult = {
  // `null` quand la correction automatique ne s'applique pas (réponse libre,
  // dessin, audio…) : on se contente alors d'afficher la réponse attendue.
  correct: boolean | null;
  answer: string;
  correctChoices: number[];
};

export type IdentitySide = 'left' | 'right' | 'hidden';

export type CandidateIdentity = {
  nom: IdentitySide;
  prenom: IdentitySide;
  tag: IdentitySide;
  classe: IdentitySide;
  date: IdentitySide;
};

export type CustomField = { id: string; label: string; side: IdentitySide };

export type ExamPresentation = {
  identity: CandidateIdentity;
  identityOrder: string[];
  customFields: CustomField[];
};

export type ExamSection = { id: string; title: string; questionIds: string[] };

export type QuestionWeight = {
  points: number;
  negative: { enabled: boolean; value: number };
  eliminatory: boolean;
};

export type ExamConfig = {
  title: string;
  titleIncluded: boolean;
  durationMinutes: number;
  presentation: ExamPresentation;
  sections: ExamSection[];
  weighting: Record<string, QuestionWeight>;
};

export type ExamPool = { id: string; name: string; color: string };

export type GeneratedExam = {
  id: string;
  title: string;
  date: string;
  q: number;
  dur: string;
  avg: string;
  status: string;
  taken: number;
  questionIds?: string[];
  config?: ExamConfig;
};

export type ExamDraft = { draftIds: string[]; config: ExamConfig; editingId: string | null };
