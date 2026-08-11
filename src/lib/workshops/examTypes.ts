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

// Pièce jointe optionnelle sur l'énoncé d'une question — image et audio sont
// indépendants (une question peut porter les deux, l'un, l'autre ou aucun) :
// il n'y a PLUS de « type de question » exclusif (retiré le 11/08/2026, voir
// docs/changelog.md). `key` est la clé de stockage (`storage.ts`), jamais une
// URL — l'URL signée est résolue à la demande, côté serveur uniquement.
export type QuestionMedia = { key: string };

// Une question vit soit dans la banque d'examen, soit dans le parcours
// pédagogique (colonne `exam_questions.context`). Même table, même éditeur,
// deux surfaces de gestion distinctes.
export type QuestionContext = 'exam' | 'parcours';

// Types de réponse — liste arrêtée le 09/08/2026 sur la maquette
// (`App-Culture.dc.html`, `_typeDefs`), huit entrées depuis le retrait du type
// « audio » le 11/08/2026 : QCM, texte, liste, tableau, matching, dessin,
// fichier, vide.
//
// `qcs` n'est PAS une entrée du menu : c'est la variante « réponse unique » de
// `qcm`, basculée par une pilule dans l'éditeur. La distinction reste stockée
// telle quelle (elle porte une vraie différence de correction : une seule case
// cochable), mais l'utilisateur ne choisit que « QCM ».
//
// Disparus : `sondage` (absorbé par QCM), `ordre` (trier dans l'ordre),
// `fill_blank` (texte à trous) et `audio` (retiré au profit d'un dépôt de
// fichier audio via `fichier`, voir FILE_TYPE_KEYS). Les lignes déjà en base
// portant ces valeurs sont ramenées à la volée par `toResponseType()` —
// aucune migration destructive, la normalisation se fait à la lecture et la
// nouvelle valeur est réécrite au premier enregistrement.
export type ResponseType =
  | 'sans_reponse'
  | 'qcs'
  | 'qcm'
  | 'textuelle'
  | 'liste'
  | 'tableau'
  | 'matching'
  | 'dessin'
  | 'fichier';

/** Ramène n'importe quelle valeur stockée (y compris les types supprimés) sur un type valide. */
export function toResponseType(value: unknown): ResponseType {
  switch (value) {
    case 'sondage': return 'qcm';        // le sondage est un QCM sans bonne réponse
    case 'ordre': return 'liste';        // trier dans l'ordre → liste numérotée
    case 'fill_blank': return 'textuelle';
    case 'grille': return 'tableau';     // nom interne de la maquette
    case 'texte': return 'textuelle';
    case 'vide': return 'sans_reponse';
    case 'match': return 'matching';
    // type de réponse « audio » retiré (11/08/2026) : le dépôt d'un fichier
    // audio en réponse reste possible via `fichier` (voir FILE_TYPE_KEYS).
    case 'audio': return 'fichier';
    default:
      return RESPONSE_TYPES.includes(value as ResponseType) ? (value as ResponseType) : 'textuelle';
  }
}

const RESPONSE_TYPES: ResponseType[] = [
  'sans_reponse', 'qcs', 'qcm', 'textuelle', 'liste', 'tableau', 'matching', 'dessin', 'fichier',
];

// Réglages propres à un type de réponse. Regroupés dans un seul objet (colonne
// jsonb `exam_questions.type_options`) plutôt qu'en colonnes dédiées : chaque
// nouveau type en apporte deux ou trois, et une colonne par réglage ferait
// grossir la table sans que la majorité des questions les utilise.
export type QuestionTypeOptions = {
  /** liste — numéros affichés à gauche de chaque ligne de réponse. */
  listNumbered?: boolean;
  /** liste — nombre de réponses attendues de l'élève. */
  listExpected?: number;
  /** tableau — libellés des lignes et des colonnes de la grille à cocher. */
  tableRows?: string[];
  tableCols?: string[];
  /** tableau — cases correctes, sous forme de clés « ligne-colonne ». */
  tableChecked?: string[];
  /** tableau — une seule case cochable par ligne. */
  tableUnique?: boolean;
  /** paire — largeur de la colonne de gauche, de 0,1 à 0,9 (0,5 par défaut).
   *  Une seule valeur pour toute la question : tous les éléments ont la même
   *  largeur, toutes les correspondances aussi. */
  matchSplit?: number;
  /** fichier — familles d'extensions acceptées (voir FILE_TYPE_KEYS). */
  fileTypes?: string[];
  /** fichier — lien vers le dépôt attendu. */
  fileUrl?: string;
  /** dessin — l'élève dessine par-dessus l'image de la question. */
  drawOnImage?: boolean;
};

export const FILE_TYPE_KEYS = ['pdf', 'image', 'word', 'excel', 'ppt', 'txt', 'audio', 'video', 'zip'] as const;
export type FileTypeKey = (typeof FILE_TYPE_KEYS)[number];

/** Tous les formats sont acceptés par défaut : c'est à l'enseignant de
 *  restreindre s'il le souhaite, pas d'ouvrir au cas par cas. */
export const DEFAULT_FILE_TYPES: string[] = [...FILE_TYPE_KEYS];

export const MATCH_SPLIT_MIN = 0.05;
export const MATCH_SPLIT_MAX = 0.95;
export const MATCH_SPLIT_DEFAULT = 0.5;

// Taxonomie de Bloom — niveau cognitif VISÉ par la question (1 mémoriser,
// 2 comprendre, 3 appliquer, 4 analyser, 5 évaluer, 6 créer). À ne pas confondre
// avec `brick_mastery.bloom_level`, qui mesure le niveau ATTEINT par un candidat
// sur une notion. Obligatoire : jamais nul, jamais absent, 1 par défaut — la
// contrainte `exam_questions_bloom_level_check` le garantit jusqu'en base.
// Quatre niveaux dans toute l'application (09/08/2026) : mémoriser, comprendre,
// appliquer, analyser. « Évaluer » et « Créer » ont été retirés — ils n'étaient
// pas exploitables en correction et `mastery.ts` plafonnait déjà à 4 niveaux
// (`MAX_LEVEL`, score de maîtrise sur 40).
export type BloomLevel = 1 | 2 | 3 | 4;

export const BLOOM_LEVELS: BloomLevel[] = [1, 2, 3, 4];

export const DEFAULT_BLOOM_LEVEL: BloomLevel = 1;

/** Ramène n'importe quelle entrée (null, undefined, valeur hors bornes) sur un
 *  niveau valide. Les anciens niveaux 5 et 6 sont ramenés à 4, le plus haut :
 *  une question « créer » reste la plus exigeante de l'échelle réduite. */
export function toBloomLevel(value: unknown): BloomLevel {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_BLOOM_LEVEL;
  if (n >= 4) return 4;
  return BLOOM_LEVELS.includes(n as BloomLevel) ? (n as BloomLevel) : DEFAULT_BLOOM_LEVEL;
}

// ─── Question liée ───────────────────────────────────────────────────────────
//
// Une « question liée » (nommée `part` dans le modèle et en base) est une
// question à part entière, PRIVÉE DES SEULS ÉLÉMENTS COMMUNS : image, audio et
// libellés restent portés une seule fois par la question principale et valent
// pour toute la grappe. Tout le reste (énoncé, type de réponse, réglages du
// type, attendus, notions, niveau de Bloom) lui est propre — refonte du
// 11/08/2026, voir docs/changelog.md.
//
// Les noms de champs sont volontairement IDENTIQUES à ceux de `Question` :
//   - un seul composant d'édition sert les deux (`QuestionFields`) ;
//   - un seul rendu d'espace de réponse sur la copie (`renderAnswerSpace`) ;
//   - pour l'IA, un contrat unique et sans surprise — un objet question, puis un
//     tableau `parts` d'objets de même forme moins les champs communs.
//
// Stockage : tableau jsonb `exam_questions.parts` sur la ligne de la question
// principale (pas de table ni de ligne par question liée). Une question liée
// n'existe jamais seule, n'est jamais tirée seule et suit toujours le sort de sa
// question principale — la lire coûte donc zéro jointure. Conséquence assumée :
// `notionIds` d'une question liée vit dans le jsonb et PAS dans la table de
// jonction `exam_question_bricks`, qui reste l'index des notions de la seule
// question principale (voir `syncQuestionNotions` dans exam.ts). Les
// consommateurs qui ont besoin de l'ensemble des notions d'une grappe font
// l'union eux-mêmes (banque de questions, crédit de maîtrise).
//
// Champs retirés le 11/08/2026 (jamais exposés par l'éditeur, valeurs mortes en
// base) : `answerOptional`, `difficulty`, `duration`. Les clés déjà présentes
// dans le jsonb sont simplement ignorées à la lecture et disparaissent au
// premier enregistrement — aucune migration.
export type QuestionPart = {
  /** Identifiant stable, propre à cette question liée et conservé d'une
   *  édition à l'autre. Il sert de clé de ligne dans `exam_question_items` et
   *  de cible à ses notions : sans lui, chaque enregistrement effacerait puis
   *  recréerait les lignes (et leurs liens) au lieu de les mettre à jour.
   *  La question principale, elle, utilise l'identifiant du groupe. */
  id: string;
  content: string;
  responseType: ResponseType;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  textLines: number;
  /** Réglages propres au type de réponse — mêmes clés que sur `Question`. */
  typeOptions: QuestionTypeOptions;
  /** Attendus de correction, propres à cette question liée. */
  expectations: string;
  /** Niveau de Bloom visé par cette question liée, indépendant du principal. */
  bloomLevel: BloomLevel;
  /** Notions couvertes par cette question liée (stockées dans le jsonb, voir
   *  plus haut — pas dans `exam_question_bricks`). */
  notionIds: string[];
};

export type Question = {
  id: string;
  title: string;
  responseType: ResponseType;
  content: string;
  // Pièce jointe sur l'énoncé — indépendantes l'une de l'autre, voir QuestionMedia.
  image?: QuestionMedia | null;
  audio?: QuestionMedia | null;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  pools: string[];
  answerOptional: boolean;
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number; seconds: number };
  /** Questions liées, dans l'ordre d'affichage — voir `QuestionPart`. */
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
  // Réglages propres au type de réponse (liste, tableau, fichier, dessin).
  typeOptions?: QuestionTypeOptions;
  // « Attendus » : instructions de correction en texte libre (détails attendus,
  // réponses acceptées, méthodologie, points de vigilance). Saisies dans les
  // paramètres avancés de l'éditeur ; destinées à la correction assistée par IA.
  expectations?: string;
  // Notions couvertes par la question (table de jonction
  // `exam_question_bricks` — encore nommée bricks en base, voir docs/backlog.md —
  // N-N, sans restriction de chapitre).
  notionIds: string[];
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

// Une question liée telle qu'un candidat la reçoit : mêmes garanties que
// `ExercisePrompt` (ni `answer` ni `correctChoices`), sans les champs communs
// (image, audio, titre) qui restent portés par la question principale.
export type ExercisePart = {
  content: string;
  responseType: ResponseType;
  choices: ExerciseChoice[];
  textLines: number;
};

export type ExercisePrompt = {
  id: string;
  title: string;
  content: string;
  // URLs signées déjà résolues côté serveur (jamais la clé de stockage brute) :
  // ce type est la vue « sans réponse » envoyée à un simple membre, voir plus haut.
  imageUrl?: string | null;
  audioUrl?: string | null;
  responseType: ResponseType;
  choices: ExerciseChoice[];
  textLines: number;
  /** Questions liées à traiter dans la foulée, dans l'ordre. */
  parts: ExercisePart[];
};

export type ExerciseResult = {
  // `null` quand la correction automatique ne s'applique pas (réponse libre,
  // dessin, fichier…) : on se contente alors d'afficher la réponse attendue.
  correct: boolean | null;
  answer: string;
  correctChoices: number[];
  /** Correction de chaque question liée, dans le même ordre que
   *  `ExercisePrompt.parts`. Absent (ou vide) quand la question n'en a pas. */
  parts?: ExerciseResult[];
};

export type IdentitySide = 'left' | 'right' | 'hidden';

export type CandidateIdentity = {
  nom: IdentitySide;
  prenom: IdentitySide;
  tag: IdentitySide;
  classe: IdentitySide;
  date: IdentitySide;
  /** Emplacement du total de points (« …… / N pts ») dans l'en-tête de la copie. */
  bareme: IdentitySide;
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
  /** Le gain décroît avec le temps mis à répondre (au lieu d'être fixe). */
  timed?: boolean;
  /** La pénalité (malus ou élimination) s'applique aussi à une absence de réponse,
   *  pas seulement à une mauvaise réponse. */
  penalizeUnanswered?: boolean;
};

export type ExamConfig = {
  title: string;
  /** Ligne secondaire sous l'intitulé, sur la copie (matière, durée, consignes…).
   *  Facultative : vide, elle n'occupe aucune place sur la feuille. */
  subtitle: string;
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
