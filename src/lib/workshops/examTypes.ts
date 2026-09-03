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

// ─── Décision : un média se porte sur l'ÉNONCÉ, jamais sur une réponse ───────
//
// Arrêté le 30/08/2026 après examen, à ne pas rediscuter sans élément nouveau :
// les propositions d'un QCM, les éléments d'une liste, les cases d'un tableau
// et les paires à relier restent du TEXTE. Pas d'image ni d'audio dans une
// proposition de réponse.
//
// Ce n'est pas un manque de temps, c'est un mauvais rapport : le même exercice
// s'obtient en mettant le média sur l'énoncé (une planche, un extrait sonore)
// et en faisant choisir parmi des options écrites — « lequel de ces éléments
// est en A ? ». Le résultat pédagogique est quasiment identique, alors que le
// coût, lui, ne l'est pas : il faudrait un dépôt de fichier par proposition,
// autant d'URL signées à résoudre à chaque tirage, un rendu à inventer sur la
// feuille A4 comme dans l'exercice du parcours, la reprise de la correction
// (qui compare des textes), du barème, de la copie de question, du contrat
// exposé à l'IA et à une future API — pour chacun des types à propositions.
//
// Conséquence pratique : `QuestionMedia` n'apparaît que sur la question (image,
// audio), et `choices` reste un tableau de chaînes partout où il existe. Si
// l'envie revient, elle doit d'abord expliquer ce que l'énoncé ne sait pas déjà
// faire.

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

/** Interprète une valeur de type de réponse, **sans jamais deviner** : elle rend
 *  un type valide quand il existe un mapping FONDÉ (type actuel, ou ancien nom
 *  dont on sait par quoi il a été remplacé), et `null` quand la valeur n'a aucun
 *  sens connu.
 *
 *  C'est la version à utiliser **à l'écriture**, où une valeur inventée doit être
 *  rejetée : la replier sur `textuelle` transformerait, par exemple, un
 *  `vrai_faux` en champ de texte libre — une question silencieusement fausse
 *  (voir `questionIntegrity.ts` et docs/ai-ingestion-plan.md §7). */
export function parseResponseType(value: unknown): ResponseType | null {
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
      return RESPONSE_TYPES.includes(value as ResponseType) ? (value as ResponseType) : null;
  }
}

/** Ramène n'importe quelle valeur stockée (y compris les types supprimés) sur un
 *  type valide, sans jamais échouer.
 *
 *  ⚠️ Version tolérante, à réserver à la **LECTURE**. Une question déjà en base a
 *  été écrite par un humain : la faire disparaître d'une liste parce que son type
 *  a été retiré détruirait son travail, d'où le repli sur `textuelle`. À
 *  l'écriture, utiliser `parseResponseType` et rejeter `null`. */
export function toResponseType(value: unknown): ResponseType {
  return parseResponseType(value) ?? 'textuelle';
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
  /** tableau — l'ordre des LIGNES change d'une copie à l'autre (les colonnes
   *  gardent le leur : elles servent de repère de lecture et de correction).
   *  Pendant exact de `shuffleChoices` pour le QCM, d'où le même libellé
   *  « ordre aléatoire » dans l'éditeur. */
  tableShuffleRows?: boolean;
  /** paire — largeur de la colonne de gauche, de 0,1 à 0,9 (0,5 par défaut).
   *  Une seule valeur pour toute la question : tous les éléments ont la même
   *  largeur, toutes les correspondances aussi. */
  matchSplit?: number;
  /** fichier — familles d'extensions acceptées (voir FILE_TYPE_KEYS). */
  fileTypes?: string[];
  /** fichier — lien vers le dépôt attendu. */
  fileUrl?: string;
  /** dessin, liste — la réponse se donne SUR l'image de la question : l'élève
   *  dessine ou écrit par-dessus, plutôt que dans un cadre à part. N'a de sens
   *  que si la question porte une image, et le réglage n'est proposé que dans
   *  ce cas — un consommateur doit donc toujours vérifier `image` avant d'en
   *  tenir compte. Remplace `drawOnImage`, qui ne valait que pour le dessin
   *  (18/08/2026) : les anciennes valeurs sont reprises à la lecture par
   *  `normalizeTypeOptions`, sans migration. */
  answerOnImage?: boolean;
  /** texte, liste, paire — la réponse se donne À LA VOIX et non par écrit. Ce
   *  qui est saisi dans l'éditeur reste la référence de correction.
   *
   *  **Le drapeau ne fait qu'IDENTIFIER ces questions**, il ne commande encore
   *  rien : le format d'une réponse orale (enregistrement, transcription,
   *  correction) reste à définir, et rien ne le lit à ce jour (18/08/2026, voir
   *  docs/backlog.md). Exclusif de `answerOnImage` — on répond d'une façon ou de
   *  l'autre. Sans effet sur la feuille A4, qui ignore les deux. */
  oralAnswer?: boolean;
  /** @deprecated Lu uniquement pour reprendre l'existant — écrire `answerOnImage`. */
  drawOnImage?: boolean;
};

/** Ramène des réglages stockés sur la forme courante. Même parti pris que
 *  `toResponseType` : la normalisation se fait à la LECTURE et la nouvelle
 *  valeur est réécrite au premier enregistrement, plutôt qu'une migration
 *  destructive sur une colonne jsonb. */
export function normalizeTypeOptions(value: unknown): QuestionTypeOptions {
  if (!value || typeof value !== 'object') return {};
  const { drawOnImage, ...rest } = value as QuestionTypeOptions;
  return drawOnImage === undefined
    ? rest
    : { ...rest, answerOnImage: rest.answerOnImage ?? drawOnImage };
}

export const FILE_TYPE_KEYS = ['pdf', 'image', 'word', 'excel', 'ppt', 'txt', 'audio', 'video', 'zip'] as const;
export type FileTypeKey = (typeof FILE_TYPE_KEYS)[number];

/** Tous les formats sont acceptés par défaut : c'est à l'enseignant de
 *  restreindre s'il le souhaite, pas d'ouvrir au cas par cas. */
export const DEFAULT_FILE_TYPES: string[] = [...FILE_TYPE_KEYS];

/** Vrai si les éléments de réponse de CET énoncé (question principale ou
 *  question liée) changeront d'ordre d'une copie à l'autre. Trois cas, et
 *  seulement trois :
 *  - les paires, toujours — les imprimer alignées donnerait la réponse ;
 *  - le QCM (et sa variante « réponse unique »), si `shuffleChoices` ;
 *  - le tableau, si `tableShuffleRows`.
 *  Les autres types n'ont pas d'éléments interchangeables.
 *
 *  Un énoncé qui n'a qu'un seul élément (ou aucun) est exclu : il n'y a rien à
 *  mélanger, et l'annoncer sur la copie serait un repère qui ne veut rien dire.
 *
 *  Prédicat partagé plutôt que trois conditions recopiées : l'éditeur, la
 *  feuille et — le jour où il existera — l'export imprimable doivent tous avoir
 *  la même définition du mélange (voir docs/backlog.md). */
export function shufflesAnswerItems(source: {
  responseType: ResponseType;
  choices?: string[];
  shuffleChoices?: boolean;
  typeOptions?: QuestionTypeOptions | null;
}): boolean {
  const choiceCount = source.choices?.length ?? 0;
  switch (source.responseType) {
    case 'matching':
      return choiceCount > 1;
    case 'qcm':
    case 'qcs':
      return source.shuffleChoices === true && choiceCount > 1;
    case 'tableau':
      return source.typeOptions?.tableShuffleRows === true && (source.typeOptions?.tableRows?.length ?? 0) > 1;
    default:
      return false;
  }
}

// ─── Encodage des réponses structurées ──────────────────────────────────────
//
// Deux types portent leur réponse dans une forme encodée plutôt que dans
// `answer`. L'encodage était recopié à trois endroits (l'éditeur, la feuille,
// l'exercice) ; il vit ici depuis qu'une quatrième source — la génération par
// IA — doit l'écrire elle aussi (25/08/2026). Une divergence d'un seul de ces
// consommateurs produirait des questions muettes, jamais une erreur.

/** Séparateur des deux côtés d'une paire, stockées « gauche :: droite » dans UNE
 *  entrée de `choices`. Un seul tableau plutôt que deux : les deux côtés d'une
 *  paire ne se réordonnent jamais l'un sans l'autre. */
export const MATCH_SEPARATOR = ' :: ';

/** Les paires d'un « matching », décodées. Un côté manquant devient une chaîne
 *  vide — jamais `undefined` : un demi-appariement reste affichable et
 *  corrigeable, contrairement à une entrée absente. */
export function matchPairs(choices: string[]): { left: string; right: string }[] {
  return (choices ?? []).map((entry) => {
    const [left = '', right = ''] = entry.split(MATCH_SEPARATOR);
    return { left: left.trim(), right: right.trim() };
  });
}

/** Encode une paire pour le stockage. Réciproque de `matchPairs`. */
export function toMatchChoice(left: string, right: string): string {
  return `${left}${MATCH_SEPARATOR}${right}`;
}

/** tableau — clé d'une case de la grille, « ligne-colonne », index à partir de
 *  0. C'est la forme stockée dans `tableChecked` et celle que le candidat
 *  renvoie. */
export function tableCellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

/** Lit une clé de case. Rend `null` sur tout ce qui n'en est pas une — une clé
 *  illisible ne doit jamais être comptée comme la case (0, 0). */
export function parseTableCellKey(key: unknown): { row: number; col: number } | null {
  if (typeof key !== 'string') return null;
  const dash = key.indexOf('-');
  if (dash <= 0) return null;
  const row = Number(key.slice(0, dash));
  const col = Number(key.slice(dash + 1));
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) return null;
  return { row, col };
}

export const MATCH_SPLIT_MIN = 0.05;
export const MATCH_SPLIT_MAX = 0.95;

// ─── Lignes de réponse d'une question textuelle ──────────────────────────────
//
// Le nombre de lignes est DESSINÉ : l'éditeur A4 et la page d'exercice tracent
// une ligne (ou un `rows` de zone de saisie) par unité. Sans plafond, une
// valeur saisie à la main de quelques milliers fige la page — incident du
// 01/09/2026. 200 lignes valent déjà plusieurs pages A4, bien au-delà de tout
// usage réel. Toute valeur venue de l'extérieur (saisie, IA, import, ligne
// déjà en base) passe par `clampTextLines`.
export const DEFAULT_TEXT_LINES = 4;
export const MAX_TEXT_LINES = 200;

export function clampTextLines(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TEXT_LINES;
  return Math.min(MAX_TEXT_LINES, Math.max(1, Math.round(value)));
}
export const MATCH_SPLIT_DEFAULT = 0.5;

// ─── Combien d'éléments une question peut porter ─────────────────────────────
//
// Des PLAFONDS, pas des cibles : une bonne question en compte presque toujours
// beaucoup moins. Ils existent parce que rien n'en fixait jusqu'ici — une
// réponse de modèle partie en boucle, ou un import mal formé, produisait une
// grille de cent lignes que plus personne ne pouvait relire ni corriger.
//
// Vingt partout, délibérément : c'est déjà au-delà de tout usage réel, et un
// seul nombre à retenir vaut mieux que des seuils qu'il faudrait justifier un
// par un. Ils sont annoncés au modèle comme des limites, et tenus à l'écriture
// (`resolveQuestion`) : ce qui dépasse est coupé, jamais accepté en silence.
//
// ⚠️ **Deux exceptions.**
// - Les COLONNES, à 5 : pas un garde-fou anti-dérive mais une contrainte de
//   largeur — au-delà, la grille ne tient plus sur une page A4. L'éditeur la
//   tenait déjà de son côté (le bouton « ajouter une colonne » disparaît à 5) ;
//   elle vit ici depuis le 01/09/2026, pour que l'IA ne puisse pas produire une
//   grille qu'un humain n'aurait pas le droit de construire.
// - La LISTE, à 200 : ses réponses ne sont pas des propositions qu'un candidat
//   doit lire une par une comme un QCM, mais des réponses ACCEPTÉES — une liste
//   qui en cite beaucoup (les régions de France, les éléments d'un tableau
//   périodique) reste une seule question légitime. `MAX_TEXT_LINES` fixe le
//   même ordre de grandeur pour la même raison : une longue énumération.
export const MAX_CHOICES = 20;
export const MAX_LIST_ANSWERS = 200;
export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLS = 5;
export const MAX_PAIRS = 20;

// Les quatre niveaux — ce que le couple question ↔ notion demande au candidat.
// À ne pas confondre avec `brick_mastery.bloom_level`, qui mesure le niveau
// ATTEINT par un candidat sur une notion.
//
// ─── Une PROGRESSION, et non la taxonomie de Bloom (01/09/2026) ─────────────
//
//   1 RECONNAÎTRE — identifier la bonne réponse parmi d'autres, dire si un
//     énoncé est juste. On ne demande pas de produire la connaissance.
//   2 RESTITUER   — produire la connaissance de mémoire : la définition, la
//     date, la liste, et ce à quoi elle sert.
//   3 APPLIQUER   — s'en servir dans une situation où son emploi est évident.
//   4 ANALYSER    — reconnaître de soi-même qu'elle est utile dans un cas moins
//     évident, souvent en la croisant avec d'autres, et s'en servir.
//
// Les deux premiers niveaux portaient les noms de Bloom — « mémoriser » puis
// « comprendre » —, deux NATURES d'effort et non deux degrés : une définition à
// écrire (mémoriser) est plus dure qu'un choix entre propositions (comprendre),
// si bien que deux questions du même niveau n'avaient pas la même difficulté et
// qu'un parcours pouvait redescendre en montant. L'échelle ci-dessus se lit
// comme une progression du plus simple au plus exigeant, ce que le produit
// mesure réellement. Elle s'écarte donc des noms de Bloom, et c'est délibéré :
// le nom du champ (`bloom_level`) est conservé, lui, pour ne pas migrer la base.
//
// ⚠️ Les niveaux déjà en base gardent leur NUMÉRO ; c'est leur sens qui bouge.
// Sans conséquence à ce jour (données de test), impensable après le lancement.
//
// ⚠️ Une question n'a PLUS de niveau à elle (28/08/2026). Elle en portait un,
// dont les niveaux par notion n'étaient qu'un raffinement facultatif : deux
// sources pour la même information, dont une seule était affichée. Le niveau vit
// désormais uniquement sur le lien vers la notion — c'est-à-dire à l'endroit
// exact où il a un sens, puisqu'il dit ce que la question fait faire de CETTE
// notion-là. La colonne `exam_question_items.bloom_level` a été supprimée le
// 31/08/2026 : il n'y a plus de seconde source à tenir en accord.
// Quatre niveaux dans toute l'application (09/08/2026). Les deux derniers de
// Bloom, « évaluer » et « créer », n'ont jamais existé ici : ils n'étaient pas
// exploitables en correction et `mastery.ts` plafonnait déjà à 4 niveaux
// (`MAX_LEVEL`, score de maîtrise sur 40).
export type BloomLevel = 1 | 2 | 3 | 4;

export const BLOOM_LEVELS: BloomLevel[] = [1, 2, 3, 4];

export const DEFAULT_BLOOM_LEVEL: BloomLevel = 1;

/** Ramène n'importe quelle entrée (null, undefined, valeur hors bornes) sur un
 *  niveau valide. Tout ce qui dépasse 4 est ramené à 4, le plus haut. */
export function toBloomLevel(value: unknown): BloomLevel {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_BLOOM_LEVEL;
  if (n >= 4) return 4;
  return BLOOM_LEVELS.includes(n as BloomLevel) ? (n as BloomLevel) : DEFAULT_BLOOM_LEVEL;
}

// Ce que vaut UN exercice du parcours : 12 niveaux de Bloom, et non 12 questions
// (règle produit du 29/08/2026). Un énoncé coûte le plus haut niveau qu'il
// demande, une grappe la somme de ses énoncés : douze énoncés « reconnaître », ou
// un « analyser » + deux « appliquer » + deux « reconnaître ». Ici plutôt que dans
// `parcoursDraw.ts` parce que l'écran d'exercice en a besoin pour sa barre
// d'avancement, et qu'il ne doit rien importer qui touche à la base.
export const EXERCISE_BLOOM_BUDGET = 12;

// Combien de niveaux au-dessus de ce qu'il a atteint une question peut demander
// à un membre. Un membre qui a atteint le niveau N sur une notion travaille le
// N+1 ; on accepte donc jusqu'à N+2 — un cran d'avance, pas deux. La règle
// s'applique à CHAQUE notion de CHAQUE énoncé de la grappe, qui se pose d'un
// bloc : une seule notion hors de portée l'écarte entière.
//
// Elle est appliquée par la base (docs/migrations/2026-08-29-tirage-en-base.sql,
// qui reçoit ce nombre en paramètre) : le tirage et le radar croisent trop de
// lignes pour se faire ici. La valeur reste ici parce que c'est une règle
// produit, pas un détail de requête.
export const BLOOM_REACH = 2;

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
  /** Notions couvertes par cette question liée, comme pour la principale :
   *  reliées à la QUESTION (`exam_question_item_bricks`), pas au groupe. */
  notionIds: string[];
  /** Niveau de Bloom **par notion**, même règle que sur la principale. */
  notionBloom: Record<string, BloomLevel>;
};

// Pas de titre : une question n'a que son énoncé (19/08/2026). Le champ
// existait du temps de l'éditeur en popup ; l'éditeur en ligne qui l'a remplacé
// n'a jamais eu de quoi le saisir, si bien qu'il ne restait que des valeurs
// figées en base — et elles masquaient l'énoncé dans les listes. Colonne
// `exam_questions.title` en attente de suppression (EN-ATTENTE-DEPLOIEMENT.md).
export type Question = {
  id: string;
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
  // Pas de chapitre sur une question : elle hérite de ceux de ses notions, des
  // deux côtés (filtre de la banque, tirage du parcours). Voir
  // `parcoursQuestionIdsOfChapter` dans `lib/workshops/exam.ts`.
  // Réglages propres au type de réponse (liste, tableau, fichier, dessin).
  typeOptions?: QuestionTypeOptions;
  // « Attendus » : instructions de correction en texte libre (détails attendus,
  // réponses acceptées, méthodologie, points de vigilance). Saisies dans les
  // paramètres avancés de l'éditeur ; destinées à la correction assistée par IA.
  expectations?: string;
  // Notions couvertes par la question (table de jonction
  // `exam_question_item_bricks` — encore nommée bricks en base, voir
  // docs/backlog.md — N-N, sans restriction de chapitre). Reliées à la QUESTION
  // et non au groupe depuis le 11/08/2026 ; l'ancienne `exam_question_bricks` a
  // été supprimée le 19/08/2026.
  notionIds: string[];
  /** ─── Le niveau de Bloom, notion par notion (28/08/2026) ─────────────────
   *
   *  Une même question peut faire RESTITUER une notion (niveau 1) et en faire
   *  ANALYSER une autre (niveau 4) : le niveau qualifie le couple question ↔
   *  notion, pas la question. C'est la SEULE forme du niveau depuis cette date ;
   *  la question n'en porte plus.
   *
   *  Une clé par entrée de `notionIds`, sans exception — c'est ce que garantit
   *  `withNotionBloom` (exam.ts), par où passe toute lecture. Une notion dont le
   *  niveau manque (question d'avant ce changement, entrée extérieure muette)
   *  reçoit `DEFAULT_BLOOM_LEVEL` : jamais de trou, donc jamais de « suit le
   *  niveau de sa question » à réinventer côté lecteur. Stocké dans la colonne
   *  `bloom_level` de la table de jonction, qui reste nullable en base — un NULL
   *  y signifie « pas encore renseigné », et se lit comme le niveau par défaut. */
  notionBloom: Record<string, BloomLevel>;
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

// Vue « sans réponse » des réglages de type, telle qu'un candidat la reçoit
// pendant un exercice. Sans elle, la page d'exercice ne peut pas dessiner une
// grille (elle en ignore les lignes et colonnes) ni une liste au bon nombre de
// champs — d'où le repli historique de tous ces types sur un simple champ
// texte.
//
// ⚠️ `tableChecked` en est exclu : les cases justes de la grille sont une
// correction, au même titre que `correctChoices`. La construction se fait en
// LISTE BLANCHE (`toExerciseTypeOptions` dans @/lib/workshops/exam), pas en
// retirant la clé sensible : un futur réglage qui porterait la réponse ne
// fuiterait pas par simple oubli.
export type ExerciseTypeOptions = Omit<QuestionTypeOptions, 'tableChecked'> & {
  /** matching — colonne de droite, MÉLANGÉE et détachée de la gauche. Les paires
   *  sont stockées « gauche :: droite » dans une même entrée de `choices` ; les
   *  envoyer telles quelles livrerait la correction. `choices` ne porte donc que
   *  la gauche, et l'ordre d'ici ne dit rien de l'appariement attendu. */
  matchRight?: string[];
};

// Une question liée telle qu'un candidat la reçoit : mêmes garanties que
// `ExercisePrompt` (ni `answer` ni `correctChoices`), sans les champs communs
// (image, audio, titre) qui restent portés par la question principale.
export type ExercisePart = {
  content: string;
  responseType: ResponseType;
  choices: ExerciseChoice[];
  textLines: number;
  typeOptions: ExerciseTypeOptions;
};

export type ExercisePrompt = {
  id: string;
  content: string;
  // URLs signées déjà résolues côté serveur (jamais la clé de stockage brute) :
  // ce type est la vue « sans réponse » envoyée à un simple membre, voir plus haut.
  imageUrl?: string | null;
  audioUrl?: string | null;
  responseType: ResponseType;
  choices: ExerciseChoice[];
  textLines: number;
  typeOptions: ExerciseTypeOptions;
  /** Questions liées à traiter dans la foulée, dans l'ordre. */
  parts: ExercisePart[];
};

// Ce qu'un candidat renvoie pour UN énoncé. Avant le 25/08/2026, il ne
// renvoyait que des index de choix (`number[]`) : tout ce qui n'était pas un QCM
// ressortait donc en « pas de correction automatique », y compris la liste, la
// grille et les paires, dont la réponse juste est pourtant connue au caractère
// près. Élargir le contrat était le préalable à leur correction.
export type ExerciseAnswer = {
  /** qcs, qcm — index des propositions cochées, dans le repère de la question
   *  (`ExerciseChoice.index`), donc insensible au mélange d'affichage. */
  choices: number[];
  /** textuelle — la réponse rédigée, telle quelle.
   *
   *  Elle ne partait pas au serveur avant le 25/08/2026 : rien ne la jugeait.
   *  Elle sert désormais à CONFIRMER une bonne réponse (jamais à en refuser
   *  une — voir `gradeStatement`). */
  text: string;
  /** liste — une entrée par ligne saisie, dans l'ordre de saisie. L'ordre ne
   *  compte pas à la correction : on compare deux ensembles. */
  list: string[];
  /** tableau — cases cochées, en clés « ligne-colonne » (`tableCellKey`). */
  table: string[];
  /** matching — index de l'élément de GAUCHE → **texte** de la correspondance
   *  qu'il a reliée.
   *
   *  ⚠️ Le texte, et non un index, et ce n'est pas un raccourci : la colonne de
   *  droite part MÉLANGÉE et détachée de la gauche (voir `matchRight`), et rien
   *  côté serveur ne mémorise la permutation d'un tirage à l'autre. Renvoyer un
   *  index de la colonne mélangée ne voudrait donc rien dire ; envoyer l'index
   *  d'origine avec l'énoncé livrerait l'appariement attendu avec la question.
   *  Le texte est déjà sous les yeux du candidat : il ne révèle rien. */
  match: Record<number, string>;
};

/** Une réponse vide — le point de départ de chaque énoncé. */
export function emptyExerciseAnswer(): ExerciseAnswer {
  return { choices: [], text: '', list: [], table: [], match: {} };
}

/** Ramène ce qu'un client envoie sur la forme attendue, sans jamais lever.
 *
 *  Une réponse d'exercice arrive par une server action, c'est-à-dire par une URL
 *  POST publique : rien ne garantit sa forme, et une correction qui plante sur
 *  un champ absent afficherait « erreur » là où la bonne réponse est « tu n'as
 *  rien répondu ». Ce qui n'est pas lisible devient donc vide, jamais une
 *  exception. */
export function toExerciseAnswer(value: unknown): ExerciseAnswer {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ExerciseAnswer, unknown>>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const match: Record<number, string> = {};
  if (raw.match && typeof raw.match === 'object') {
    for (const [key, text] of Object.entries(raw.match as Record<string, unknown>)) {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && typeof text === 'string') match[index] = text;
    }
  }

  return {
    choices: Array.isArray(raw.choices)
      ? raw.choices.filter((x): x is number => Number.isInteger(x) && (x as number) >= 0)
      : [],
    text: typeof raw.text === 'string' ? raw.text : '',
    list: strings(raw.list),
    table: strings(raw.table),
    match,
  };
}

export type ExerciseResult = {
  // `null` quand la correction automatique ne s'applique pas (réponse libre,
  // dessin, fichier…) : on se contente alors d'afficher la réponse attendue.
  correct: boolean | null;
  answer: string;
  correctChoices: number[];
  /** tableau — cases justes, en clés « ligne-colonne ». N'est renvoyé
   *  QU'APRÈS validation : c'est la correction, elle ne voyage jamais avec
   *  l'énoncé (voir `ExerciseTypeOptions`). */
  correctTable?: string[];
  /** liste — les réponses attendues, dans l'ordre où l'auteur les a écrites. */
  correctList?: string[];
  /** matching — les paires attendues, remises côte à côte. */
  correctPairs?: { left: string; right: string }[];
};

// Une correction porte UN énoncé, jamais la grappe entière : depuis le
// 30/08/2026, les questions liées se posent et se corrigent une par une, donc
// la correction de la suivante n'existe pas encore quand on rend celle-ci. Le
// champ `parts` qui les portait toutes d'un coup a disparu avec cette règle —
// le rendre à ce type reviendrait à faire descendre au navigateur des réponses
// à des questions qui ne sont pas encore posées.

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
  /** Barème imprimé dans la marge droite de la copie, en face de chaque question
   *  et de chacune de ses questions liées. Réglage de mise en page de la
   *  feuille, au même titre que `durationMinutes` — et comme lui hors de
   *  `presentation`, qui ne décrit que l'en-tête (voir `presentationSignature`,
   *  qui sert de clé au favori). */
  showQuestionPoints: boolean;
  /** Sous-total imprimé en face du titre de chaque partie. Indépendant de
   *  `showQuestionPoints` : on peut vouloir le détail sans les sous-totaux, ou
   *  l'inverse. Rien d'autre ne le conditionne — une copie qui n'a qu'une partie
   *  l'affiche aussi si l'option est active, quitte à répéter le total de
   *  l'en-tête. */
  showSectionPoints: boolean;
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
