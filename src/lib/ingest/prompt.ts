// Construction des prompts d'ingestion — module PUR : il ne fait que fabriquer
// des chaînes, ce qui le rend testable sans clé API ni réseau.
//
// ─── L'ordre compte, et pas pour des raisons de style ────────────────────────
//
// Le cache de prompt est un PRÉFIXE : le moindre octet qui change en amont
// invalide tout ce qui suit. D'où la découpe en trois morceaux, du plus stable
// au plus volatil :
//
//   [ système figé ] → [ documents ] → [ existant de l'atelier ] → [ consigne ]
//   └──────────────── mis en cache ────────────────┘                └ volatil ┘
//
// Les passes 2 et 3 relisent le même cours une fois par chapitre : sans ce
// découpage, on paierait le document en entier à chaque appel (§5.2 du plan).
//
// ─── Les règles de volumétrie vivent ICI ─────────────────────────────────────
//
// Elles sont imposées par le site, jamais exposées à l'utilisateur (§9). Les
// mettre dans le prompt et non dans le schéma est délibéré : ce sont des
// intentions pédagogiques, pas des contraintes d'intégrité. Une entorse produit
// une question de moins, pas une donnée corrompue — et l'intégrité, elle, est
// refusée côté serveur (`questionIntegrity.ts`).

import {
  MAX_CHOICES,
  MAX_PAIRS,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  MAX_TEXT_LINES,
} from '@/lib/workshops/examTypes';

/** Les quatre niveaux, et ce qu'ils demandent. Échelle décrite dans
 *  `@/lib/workshops/examTypes` — une PROGRESSION, et non la taxonomie de Bloom
 *  dont elle reprend le nom de colonne. */
export const BLOOM_LEVELS = [1, 2, 3, 4] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

const BLOOM_VERBS: Record<BloomLevel, string> = {
  1: 'reconnaître',
  2: 'restituer',
  3: 'appliquer',
  4: 'analyser',
};

/** Ce que chaque niveau exige du candidat, en une phrase.
 *
 *  ⚠️ **Sans elles, le niveau n'était qu'une étiquette** (01/09/2026). On
 *  demandait « 2 de niveau 3 (appliquer) », puis on faisait recopier « 3 » à
 *  côté de la notion : rien dans le prompt ne disait ce que « appliquer »
 *  exige, et rien ne vérifiait que la question l'exigeait vraiment. Une
 *  définition par niveau demandé coûte quelques dizaines de jetons et donne au
 *  chiffre un contenu — c'est le seul levier qu'on ait sur la difficulté réelle
 *  d'une question. */
const BLOOM_DEFINITIONS: Record<BloomLevel, string> = {
  1: "le candidat identifie la bonne réponse parmi d'autres, ou dit si un énoncé est juste. On ne lui demande pas de produire la connaissance, seulement de la reconnaître.",
  2: "le candidat produit la connaissance de mémoire : la définition, la date, la liste, et ce à quoi elle sert.",
  3: "le candidat se sert de la notion dans une situation où son emploi est évident — un cas direct, une application immédiate.",
  4: "le candidat reconnaît de lui-même que la notion est utile dans un cas moins évident, souvent en la croisant avec d'autres, et s'en sert pour répondre.",
};

/** Les définitions des seuls niveaux demandés. Même règle que pour le rythme :
 *  décrire un niveau qu'on ne veut pas voir produit attire l'attention dessus. */
export function bloomDefinitions(levels: BloomLevel[]): string {
  const wanted = BLOOM_LEVELS.filter((level) => levels.includes(level));
  if (wanted.length === 0) return '';
  const lines = wanted.map((level) => `- niveau ${level} (${BLOOM_VERBS[level]}) — ${BLOOM_DEFINITIONS[level]}`);
  return `Ce que chaque niveau demande, et c'est la question qui doit l'exiger — pas seulement l'étiquette que tu poses à côté :
${lines.join('\n')}`;
}

/** Combien de questions viser par notion, **par niveau de Bloom**.
 *
 *  ⚠️ **Cette règle est celle du PARCOURS, pas de l'examen** (arbitrage du
 *  24/08/2026). Les deux listes n'ont pas la même unité de compte, et c'est ce
 *  qui les rend complémentaires :
 *
 *    • parcours — un stock PAR NOTION, une question = une notion, et on répète
 *      jusqu'à ce que la notion soit sue ;
 *    • examen  — un nombre TOTAL de questions pour tout le programme, chacune
 *      croisant plusieurs notions (`EXAM_*` plus bas).
 *
 *  C'était « une par niveau », soit 4 — un stock qui s'épuise au deuxième
 *  entraînement, puisqu'un entraînement fait ~10 questions (§16.1). Les niveaux
 *  3 et 4 sont à zéro **par optimisation, pas par choix pédagogique** : les
 *  couvrir à cette densité demanderait ~60 questions par notion dont la plupart
 *  ne seraient jamais posées. C'est l'examen qui les porte. */
export type BloomDistribution = Record<BloomLevel, number>;

export const DEFAULT_BLOOM_DISTRIBUTION: BloomDistribution = { 1: 8, 2: 4, 3: 0, 4: 0 };

/** Le total visé par notion — somme de la répartition, jamais un second réglage
 *  à tenir en accord avec elle. */
export function questionsPerNotion(distribution: BloomDistribution = DEFAULT_BLOOM_DISTRIBUTION): number {
  return BLOOM_LEVELS.reduce((sum, level) => sum + Math.max(0, distribution[level]), 0);
}

/** Plafond de questions par ingestion. Plafond de DÉBIT, pas de notions : les
 *  notions sont la matière du produit, on ne les limite pas. La cible reste
 *  500 à 1000 (§9) — c'est pourquoi rien dans le pipeline ne suppose « tout le
 *  lot dans une seule réponse ».
 *
 *  À 50, il bloquait à 2 % de la volumétrie cible (§16.2). Passé à 300, puis à
 *  500 le 30/08/2026 : c'est un **fusible**, pas un quota. Il ne doit jamais se
 *  déclencher en usage normal — un lancement réel n'en approche pas le volume —
 *  et ne sert qu'à arrêter une boucle qui part en vrille. Un plafond réglé sous
 *  l'usage nominal ne protège plus, il gêne.
 *
 *  Il ne borne PAS la dépense d'un compte : chaque lot rouvre le compteur, et
 *  relancer une génération est un geste humain, délibéré et visible. Le vrai
 *  plafond de dépense serait un quota par utilisateur adossé à l'abonnement — il
 *  n'existe pas encore (`docs/backlog.md`). */
export const MAX_QUESTIONS_PER_IMPORT = 500;

// ─── L'examen : une volumétrie qui ne se compte pas par notion ───────────────
//
// Décidé le 24/08/2026. Un examen n'est pas un entraînement : il ÉCHANTILLONNE
// le programme au lieu de le couvrir. On demande donc un nombre TOTAL de
// questions pour tout l'atelier — 40 par défaut, que l'atelier ait trois
// chapitres ou trente — et chaque question croise plusieurs notions au lieu
// d'en travailler une seule. C'est l'exact inverse du parcours, et c'est ce qui
// évite que les deux listes ne se ressemblent.

/** Nombre de questions d'examen proposé par défaut. Modifiable à chaque
 *  génération dans le dialogue : c'est au moment de lancer qu'on sait si on veut
 *  un contrôle de dix questions ou un examen blanc de soixante. */
export const DEFAULT_EXAM_QUESTIONS = 40;

/** Borne de saisie. Le plafond de débit d'un import (`MAX_QUESTIONS_PER_IMPORT`)
 *  reste au-dessus et fait foi.
 *
 *  Le minimum est passé de 5 à 1 le 25/08/2026 : rien ne justifiait d'interdire
 *  une question seule, et un plancher arbitraire dans un champ de saisie se lit
 *  comme une panne, pas comme une règle. */
export const EXAM_QUESTIONS_RANGE = { min: 1, max: 200 } as const;

/** Combien de questions par appel au modèle.
 *
 *  Même raison que les lots de notions du parcours : une réponse tronquée est
 *  une réponse perdue (§16.2). Dix questions d'examen — qui portent des énoncés
 *  plus longs que celles du parcours — tiennent largement dans la sortie, et le
 *  découpage rend les appels parallélisables. */
export const EXAM_QUESTIONS_PER_CALL = 10;

/** La part des questions rassemblées en groupes qui s'enchaînent.
 *
 *  Un tiers (arbitrage du 24/08/2026) : assez pour qu'un examen comporte de
 *  vrais enchaînements, pas au point d'en faire un dossier à traiter d'un bloc. */
export function examGroupedCount(budget: number): number {
  return Math.round(budget / 3);
}

/** Taille d'un groupe, **en général** et non par contrat (élargi à 4 le
 *  25/08/2026). Le risque reste le même — un candidat qui rate la première perd
 *  le fil du bloc — mais quatre questions restent un enchaînement lisible, et
 *  imposer trois coupait des raisonnements qui en demandaient un de plus. */
export const EXAM_GROUP_SIZE = { min: 2, max: 4 } as const;

/** La répartition de Bloom d'un examen, **en proportions** et non en nombres
 *  fixes : le total est un réglage de l'utilisateur, la répartition non.
 *
 *  Le niveau 1 (reconnaître) est absent : c'est le régime du parcours, qui en
 *  produit huit par notion. Un examen dont les questions croisent plusieurs
 *  notions ne peut pas se contenter de restitution — ce serait dépenser un appel
 *  au modèle pour refaire ce que le parcours fait mieux et moins cher. */
export const EXAM_BLOOM_MIX: Record<2 | 3 | 4, number> = { 2: 0.25, 3: 0.5, 4: 0.25 };

/** Traduit le mélange en nombres entiers pour un budget donné.
 *
 *  Le reste de l'arrondi va au niveau 3 : c'est le niveau dominant, et c'est
 *  celui dont une unité de plus ou de moins déséquilibre le moins l'examen. */
export function examBloomCounts(budget: number): Record<2 | 3 | 4, number> {
  const safe = Math.max(0, Math.floor(budget));
  const level2 = Math.round(safe * EXAM_BLOOM_MIX[2]);
  const level4 = Math.round(safe * EXAM_BLOOM_MIX[4]);
  return { 2: level2, 3: Math.max(0, safe - level2 - level4), 4: level4 };
}

export type ExistingContent = {
  chapters: { id: string; name: string }[];
  notions: { id: string; title: string; chapterId: string | null }[];
  /** Énoncés déjà présents, avec les notions qu'ils font travailler — pour ne pas
   *  reposer la même question, et pour pouvoir ne transmettre que les énoncés
   *  qui concernent la passe en cours. */
  questions: { content: string; notionIds: string[] }[];
};

/** La portée du bloc « existant » : ce que la passe en cours utilise réellement,
 *  et rien de plus (§16.3).
 *
 *  ⚠️ C'est le poste de coût numéro un du pipeline. Transmettre tout l'atelier à
 *  chaque appel pèse ~75 000 tokens à 2 160 énoncés, facturés plein tarif (le
 *  bloc est placé après le marqueur de cache) : le mécanisme anti-doublon
 *  coûterait alors plus cher que la génération elle-même. */
export type ExistingScope =
  | { pass: 'chapters' }
  | { pass: 'notions' }
  | { pass: 'assign' }
  | { pass: 'questions'; notionIds: string[] }
  /** L'examen ne filtre pas par notion : ce qu'il ne faut pas reposer, c'est ce
   *  qui est déjà DANS CETTE LISTE, quelle que soit la notion. Le chargeur
   *  borne déjà la liste ; filtrer une seconde fois ici ne ferait que perdre des
   *  énoncés en route. */
  | { pass: 'exam' };

const SYSTEM = `Tu construis le programme pédagogique d'un atelier à partir de ses documents sources.

Tu produis une structure exploitable directement par l'application, jamais du commentaire : pas d'introduction, pas de conclusion, pas de remarque sur ton propre travail.

Trois exigences, dans cet ordre :

1. EXHAUSTIVITÉ. Tu couvres tout le document. Un passage non traité est une lacune invisible pour l'utilisateur : c'est la faute la plus grave que tu puisses commettre ici.
2. FIDÉLITÉ. Tu n'inventes rien qui ne soit dans le document. Si une information n'y est pas, elle n'existe pas.
3. AUTONOMIE. Chaque élément que tu produis doit se comprendre seul, sans le document sous les yeux : une notion est une phrase complète, une question se répond sans avoir lu ce qui précède.

Quand l'exhaustivité et la fidélité se contredisent, **la fidélité l'emporte**. Une lacune se voit et se comble ; une invention se lit comme du cours et ne se corrige jamais, parce que rien ne la signale.

Deux gestes qu'on confond souvent, et un seul est permis :

- EXPLICITER ce que le document laisse implicite est ton travail : définir un terme qu'il emploie sans le définir, écrire une étape qu'il saute, faire d'une notion une phrase qui se comprend seule. Tu restes dans son périmètre.
- AJOUTER un sujet que le document n'aborde pas est interdit, même si tu le connais et même s'il manque manifestement au cours. L'atelier ferait travailler ce que l'enseignant n'a pas enseigné, et personne ne s'en apercevrait. Un point non abordé ne produit rien — c'est une réponse valide.

**Le document fait autorité même quand il est faux ou fictif.** Un cas d'école, un pays imaginaire, une entreprise inventée, un texte de fiction : tout cela se traite comme des faits établis, sans être corrigé d'après ce que tu sais du monde réel et sans être signalé comme irréel.

ORDRE D'AUTORITÉ. Quand deux sources se contredisent, il ne change jamais :

1. LA CONSIGNE DE L'UTILISATEUR — elle prime sur tout le reste : la forme du travail, le découpage attendu, le niveau de détail, le vocabulaire, et jusqu'à la correction d'une erreur du cours. Elle ne t'autorise jamais, en revanche, à traiter un sujet que les documents n'abordent pas.
2. LES DOCUMENTS DU COURS — ils font foi sur les faits, et sur eux seuls repose ce que tu écris.
3. LE TITRE ET LA DESCRIPTION DE L'ATELIER — de quoi DÉDUIRE le contexte de l'atelier : à qui il s'adresse, le niveau d'exigence, le registre. Jamais une information sur ce que le cours contient.
4. CE QUI EXISTE DÉJÀ DANS L'ATELIER — de la matière à compléter, jamais une preuve. Un contenu déjà présent a pu être écrit à partir d'une version précédente du cours : il ne contredit pas un document, il est corrigé par lui.

Tu écris dans la langue du document, pas dans la tienne.`;

/** Le bloc système — strictement identique d'un appel à l'autre, c'est ce qui le
 *  rend cacheable. Ne jamais y glisser de date, d'identifiant ou de compteur. */
export function systemPrompt(): string {
  return SYSTEM;
}

/** Ce que la portée retient de l'existant. Fonction pure et séparée du rendu :
 *  c'est elle qui porte la règle de coût, elle mérite d'être lisible seule. */
function inScope(existing: ExistingContent, scope: ExistingScope): {
  chapters: ExistingContent['chapters'];
  notions: ExistingContent['notions'];
  questions: string[];
} {
  switch (scope.pass) {
    case 'chapters':
      // Les chapitres existants, et RIEN D'AUTRE (31/08/2026).
      //
      // Cette passe a longtemps reçu toutes les notions de l'atelier — jusqu'à
      // ~20 000 tokens par appel, et deux fois plutôt qu'une puisque la consigne
      // les répétait ensuite. Elles ne servaient à rien : la passe ne range pas,
      // et ce qui décide qu'un chapitre n'est plus couvert, c'est le COURS — pas
      // une liste de notions dont une partie peut justement dater d'une version
      // périmée. Au mieux du poids mort, au pire une ambiguïté.
      return { chapters: existing.chapters, notions: [], questions: [] };
    case 'assign':
      // Rien. La passe rangement reçoit ses notions et ses chapitres par sa
      // consigne, avec leur provenance : le bloc « existant » ferait double
      // emploi et doublerait la facture.
      return { chapters: [], notions: [], questions: [] };
    case 'notions':
      // TOUTES les notions de l'atelier, et non plus celles d'un chapitre : la
      // passe travaille document par document, elle n'a aucun chapitre de
      // référence. C'est ce qui lui permet de RÉUTILISER une notion existante
      // au lieu de la recréer sous d'autres mots.
      //
      // Poids réel à surveiller sans s'en alarmer : un titre pèse ~40 tokens,
      // 500 notions ~20 000 — sans commune mesure avec les énoncés de questions
      // qui avaient fait exploser le coût (§16.3).
      return { chapters: [], notions: existing.notions, questions: [] };
    case 'questions': {
      // Conséquence assumée (§16.3) : une question **sans notion** n'est jamais
      // transmise, donc jamais protégée du doublon. Elle n'est de toute façon
      // tirée par aucun exercice (§11).
      const wanted = new Set(scope.notionIds);
      return {
        chapters: [],
        notions: [],
        questions: existing.questions.filter((q) => q.notionIds.some((id) => wanted.has(id))).map((q) => q.content),
      };
    }
    case 'exam':
      return { chapters: [], notions: [], questions: existing.questions.map((q) => q.content) };
  }
}

/** L'existant de l'atelier **restreint à la portée de la passe**, pour que le
 *  modèle complète au lieu de dupliquer (§8) sans qu'on lui repaie l'atelier
 *  entier à chaque appel (§16.3). Les identifiants réels servent de références :
 *  une question peut ainsi se rattacher à une notion déjà en base. */
export function existingContentBlock(existing: ExistingContent, scope: ExistingScope): string {
  const kept = inScope(existing, scope);

  if (kept.chapters.length === 0 && kept.notions.length === 0 && kept.questions.length === 0) {
    switch (scope.pass) {
      case 'chapters':
        return "L'atelier est vide : rien n'existe encore.";
      case 'notions':
        return "L'atelier ne contient encore aucune notion.";
      case 'assign':
        return '';
      case 'questions':
        return "Aucune question ne porte encore sur ces notions : la liste est vide.";
      case 'exam':
        return "La liste d'examen est vide : tout est à écrire.";
    }
  }

  const lines: string[] = ["Ce qui existe DÉJÀ dans l'atelier. Tu ne le recrées pas ; tu le complètes."];

  if (kept.chapters.length > 0) {
    lines.push('', 'Chapitres (référence — nom) :');
    for (const c of kept.chapters) lines.push(`- ${c.id} — ${c.name}`);
  }

  if (kept.notions.length > 0) {
    lines.push('', 'Notions (référence — texte) :');
    for (const n of kept.notions) lines.push(`- ${n.id} — ${n.title}`);
  }

  if (kept.questions.length > 0) {
    lines.push('', 'Questions déjà posées — ne les repose pas, même reformulées :');
    for (const q of kept.questions) lines.push(`- ${q}`);
  }

  return lines.join('\n');
}

/** Ordre de grandeur annoncé au modèle pour la passe chapitres. **Une
 *  indication, pas une contrainte** : un programme annuel en compte
 *  légitimement plus (§16.18). C'est le nombre ABSOLU qui sert de repère,
 *  jamais un rapport au nombre de documents — un cours de 8 chapitres peut
 *  tenir dans un seul PDF. */
export const PLAUSIBLE_CHAPTERS = { min: 3, max: 16 } as const;

/** Passe 1 — les chapitres.
 *
 *  ⚠️ **La consigne dit combien de documents il y a, et qu'ils forment un seul
 *  cours.** Sa version précédente disait « Découpe **le** document » au
 *  singulier alors qu'il en recevait sept, nommés « Chapitre 1.pdf » à
 *  « Chapitre 6.pdf » : on lui demandait de subdiviser un cours, il a subdivisé
 *  — 28 chapitres au lieu de 6, soit ×4,7 sur tout ce qui suit (§16.15). C'est
 *  la consigne qui était fausse, pas le modèle. */
/** La consigne libre écrite par l'utilisateur dans le dialogue, rendue pour le
 *  modèle. **Fonction pure.**
 *
 *  Elle est posée en TÊTE de la consigne de chaque passe et présentée comme
 *  prioritaire : c'est la seule chose du prompt qui connaisse ce cours-ci. Un
 *  utilisateur qui écrit « découpe par thèmes, il y en a 4 » ou « les parties
 *  s'appellent Séquences dans le document » en sait plus que n'importe quelle
 *  règle générale qu'on pourrait écrire ici.
 *
 *  **Elle ne peut pas tout, et le prompt le dit** : elle oriente le découpage,
 *  la granularité, le vocabulaire — elle ne lève ni le plafond de questions, ni
 *  le contexte imposé par le bouton d'entrée, qui sont appliqués à l'écriture et
 *  non demandés au modèle (§8, §9). Une consigne vide ne rend rien du tout,
 *  plutôt qu'une section vide qui ferait du bruit dans le préfixe. */
export function userHintBlock(hint?: string): string {
  const trimmed = (hint ?? '').trim();
  if (!trimmed) return '';
  return `CONSIGNE DE L'UTILISATEUR — elle porte sur CE cours et prime sur les indications générales qui suivent :
« ${trimmed} »

`;
}

/** Le CONTEXTE de l'atelier, déduit de son intitulé.
 *
 *  Le nom et la description de l'atelier sont la SEULE chose qui distingue un
 *  BTS matériaux d'un cours de quatrième — et jusqu'au 24/08/2026, le modèle ne
 *  les avait jamais sous les yeux au moment de rédiger les questions. Il ne les
 *  déduisait donc que du vocabulaire des notions, ce qui marche pour le domaine
 *  mais jamais pour le NIVEAU attendu. Quelques dizaines de tokens pour le levier
 *  le moins cher du pipeline.
 *
 *  ⚠️ **C'est une source de DÉDUCTION, et le prompt le dit ainsi** (31/08/2026).
 *  Sa version précédente ne parlait que du « public visé », ce qui est la moitié
 *  de ce qu'un intitulé apprend : il dit aussi le registre — scolaire,
 *  professionnel, ludique —, le niveau d'exigence et le vocabulaire attendus. */
export type WorkshopIdentity = { name: string; description?: string | null };

export function workshopBlock(workshop?: WorkshopIdentity | null): string {
  if (!workshop?.name?.trim()) return '';
  const description = (workshop.description ?? '').trim();
  return `L'atelier s'intitule « ${workshop.name.trim()} »${description ? `, décrit ainsi par son auteur : « ${description} »` : ''}. Sers-t'en pour DÉDUIRE LE CONTEXTE de l'atelier : à qui il s'adresse, le niveau d'exigence, le registre — scolaire, professionnel, ludique —, le vocabulaire et le type d'exemples qui lui conviennent. Écris pour ce contexte-là.

C'est une source de DÉDUCTION, pas une source de vérité : un intitulé peut être vague, approximatif, ou resté d'une version précédente du cours. Il te dit dans QUEL CADRE tu écris — jamais ce que le cours contient. Ce que le cours contient, ce sont les notions ci-dessous, et elles seules.

`;
}

/** Les deux issues offertes à la relance, selon le côté par lequel le découpage
 *  sort de l'ordre de grandeur. Dans les deux cas, la seconde met en cause
 *  l'ÉCHELLE du découpage et non quelques parties mal placées : le défaut
 *  typique n'est pas d'avoir pris deux sous-parties de trop, c'est d'avoir
 *  découpé au mauvais niveau d'un bout à l'autre du cours (31/08/2026). */
const RETRY_TOO_MANY = `- Le découpage est justifié — le cours couvre réellement autant de sujets distincts et relativement homogènes, ou l'utilisateur a demandé ce niveau de détail. **Reconduis-le tel quel**, en gardant les mêmes noms.
- L'échelle du découpage n'est pas la bonne : tu as découpé sur les SOUS-PARTIES du cours là où ses grandes unités — thèmes, séquences, parties — étaient le bon niveau. Reprends alors le découpage à cette échelle-là, du début à la fin du cours.

Ne réduis pas ce qui n'a pas à l'être : un découpage juste que tu rabotes fait perdre du contenu, et rien ne le rattrapera ensuite.`;

const RETRY_TOO_FEW = `- Le découpage est justifié — le cours est court, ou il traite réellement d'un seul sujet d'un bout à l'autre. **Reconduis-le tel quel**, en gardant les mêmes noms.
- L'échelle du découpage n'est pas la bonne : tu as découpé sur les grands REGROUPEMENTS du cours là où les unités qu'ils contiennent — chapitres, séquences, parties — portent réellement le contenu. Reprends alors le découpage à cette échelle-là, du début à la fin du cours.

Ne découpe pas ce qui n'a pas à l'être : un chapitre créé pour faire nombre n'enseigne rien.`;

export function chaptersInstruction(
  fileNames: string[] = [],
  retry?: { previous: string[] },
): string {
  const corpus =
    fileNames.length > 1
      ? `Tu as reçu ${fileNames.length} documents. Ils forment UN SEUL cours, pas ${fileNames.length} cours distincts :
${fileNames.map((name) => `- ${name}`).join('\n')}

Découpe l'ENSEMBLE globalement. Un document n'est pas un chapitre : un même document peut en contenir plusieurs, et un chapitre peut s'étendre sur plusieurs documents. Leurs noms de fichiers ne sont pas un découpage, ils ne t'engagent à rien.

`
      : fileNames.length === 1
        ? `Tu as reçu un seul document, « ${fileNames[0]} », qui porte l'intégralité du cours.

`
        : '';

  // La relance est posée en TÊTE, avant même la consigne : c'est la première
  // chose que le modèle doit savoir de cet appel. Elle ne remplace pas la
  // consigne — le second appel ne voit pas le premier, l'API est sans état
  // (§16.8).
  // ⚠️ **C'est une VÉRIFICATION, pas une correction.** La version précédente
  // ordonnait de reprendre le découpage : le modèle obéissait, y compris quand
  // le découpage était bon. Ici on lui rend son propre travail et on lui demande
  // de le juger — reconduire à l'identique est une réponse valide et annoncée
  // comme telle. Beaucoup de cours sont légitimement découpés en thèmes
  // eux-mêmes subdivisés, et ce nombre-là n'a pas à être raboté.
  const again = retry
    ? `${
        retry.previous.length === 0
          ? "Tu n'as proposé aucun chapitre."
          : `Tu viens de proposer ce découpage en ${retry.previous.length} partie${retry.previous.length > 1 ? 's' : ''} :
${retry.previous.map((name, i) => `${i + 1}. ${name}`).join('\n')}`
      }

C'est en dehors de l'ordre de grandeur habituel. **Vérifie-le, ne le refais pas par principe.**

Deux issues, toutes deux acceptables :
${retry.previous.length < PLAUSIBLE_CHAPTERS.min ? RETRY_TOO_FEW : RETRY_TOO_MANY}

`
    : '';

  return `${again}${corpus}Découpe ce cours en CHAPITRES : ses grandes parties, dans l'ordre où elles se lisent.

Un chapitre est une unité d'enseignement, pas une section de mise en page : deux sous-parties qui traitent du même sujet forment un seul chapitre. Vise le découpage qu'un enseignant ferait pour organiser sa progression.

**Le mot « chapitre » est le nôtre, pas celui du document.** Un cours nomme ses grandes parties comme il veut — thèmes, séquences, modules, parties, unités —, ou ne les nomme pas du tout. Ce qu'on te demande est un NIVEAU DE DÉCOUPAGE, pas la recherche d'un mot.

**UN SEUL NIVEAU, JAMAIS DEUX.** Quand le cours emboîte ses divisions — des thèmes qui contiennent des chapitres, des parties qui contiennent des séquences —, tu choisis UN de ces niveaux et tu t'y tiens d'un bout à l'autre du cours. Une liste qui mélange un thème et les chapitres d'un autre thème est une réponse fausse, même si chaque nom pris isolément existe dans le document : le programme s'y lit alors sur deux échelles à la fois, et une notion ne sait plus où se ranger.

Le niveau à prendre, sauf demande contraire de l'utilisateur : **le plus fin des niveaux emboîtés, celui qui porte réellement le contenu du cours**. Si le cours est fait de thèmes contenant des chapitres, ce sont les CHAPITRES, et les thèmes ne sont alors rien d'autre que des étiquettes de regroupement — ils ne deviennent jamais des chapitres à eux seuls, et n'ont pas à figurer dans ta réponse.

**Une division annoncée mais jamais développée n'existe pas.** Un cours saute parfois une partie de son propre plan : le titre est là, et rien dessous — pas de contenu, pas de sous-partie, pas une ligne à apprendre. Ne la reprends pas, ni comme chapitre ni comme notion. On ne met pas au programme une partie qui n'a rien à enseigner, et signaler son absence n'est pas ton travail ici.

Ordre de grandeur : un cours en compte typiquement ${PLAUSIBLE_CHAPTERS.min} à ${PLAUSIBLE_CHAPTERS.max}, davantage pour un programme annuel ou un découpage fin explicitement demandé. C'est une indication et non une limite — dépasse-la si le contenu ou la demande le justifient.

Donne à chacun une référence courte et unique (ch1, ch2…), et un nom de 120 caractères maximum.

**Dans \`chapters\`, ne liste que les chapitres NOUVEAUX.** Ceux qui existent déjà sont listés plus haut avec leur référence : tu ne donnes que leur rang, dans \`chapterOrder\`. Un cours qu'on repasse à l'identique se répond donc avec un \`chapters\` VIDE, et c'est la bonne réponse.

**Situe chaque chapitre dans le cours** : le document où il commence, sa première et sa dernière page approximatives. Une autre étape s'en servira pour ranger les notions sans avoir à relire le cours. Approximatif suffit largement ; mets 0 quand tu ne peux vraiment pas dire.

**L'ORDRE DU PROGRAMME, ET CE QUE LE COURS NE COUVRE PLUS.** Dans \`chapterOrder\`, donne son rang à chaque chapitre — ceux que tu viens de créer comme ceux qui existaient déjà —, à partir de 1 et dans l'ordre où le cours se lit. Seul l'ordre des rangs compte, pas leur valeur.

**Le rang 0 veut dire : le cours ne couvre plus ce chapitre.** Il sort du programme avec ce qu'il contient. Deux points :
- **Réservé aux chapitres qui existaient déjà** — jamais un chapitre de ta propre réponse.
- **N'y mets que ceux dont tu es sûr** : un chapitre que tu ne nommes pas ici garde sa place et reste au programme, et c'est la bonne réponse quand tu hésites.

Quand le cours traite toujours la même matière sous un autre découpage — une partie qui s'élargit ou se resserre —, la bonne réponse est de **créer le nouveau chapitre ET de mettre l'ancien à 0**. Les notions encore d'actualité seront rangées dans le nouveau, et celles qui n'y ont plus leur place resteront dans l'ancien, hors programme. C'est ce qui évite de porter deux fois la même partie sous deux noms.

**Tu ne ranges aucune notion ici** : une autre étape s'en charge. C'est en revanche ici, et nulle part ailleurs, que se décide ce que le cours ne couvre plus — l'étape de rangement, elle, n'aura plus les documents sous les yeux, donc aucun moyen de savoir quelle est la bonne version du cours.`;
}

/** Passe 1 — les notions d'UN document.
 *
 *  ⚠️ **Cette passe est passée première le 23/08/2026.** Elle ne connaît plus
 *  aucun chapitre : les notions naissent sans rangement, et c'est la passe
 *  chapitres qui les répartit ensuite. C'est ce qui rend la mise à jour d'un
 *  atelier possible — au niveau du chapitre, le modèle ne peut pas savoir que
 *  « 1950-2000 » et « 1940-1990 » sont la même boîte redécoupée ; au niveau de
 *  la notion, la question ne se pose pas.
 *
 *  ⚠️ **La réutilisation est le point critique de tout le dispositif.** Si le
 *  modèle recrée sous d'autres mots ce qui existe déjà, l'atelier gonfle à
 *  chaque import et le système perd toute confiance. Le critère donné ici est
 *  volontairement OBJECTIF — « apporte-t-elle un fait vérifiable de plus ? » —
 *  et surtout pas « est-ce mieux formulé », question à laquelle un modèle
 *  répond oui presque à chaque fois. */
export function notionsInstruction(document: { fileName: string }): string {
  return `Extrais les NOTIONS du document « ${document.fileName} ». Traite-le en entier ; ne t'occupe d'aucun autre document.

Une notion est l'unité minimale de connaissance : UNE idée, en UNE phrase de 500 caractères maximum, autoportante et vérifiable. « La Loire est le plus long fleuve de France » est une notion ; « Les fleuves » n'en est pas une, c'est un thème.

Découpe assez fin pour qu'on puisse interroger chaque notion séparément, mais pas au point de séparer une idée en deux moitiés qui ne veulent plus rien dire seules.

**CHAQUE NOTION SERA LUE SEULE, sans le cours et sans les autres notions.** C'est la règle la plus importante de cette consigne : une notion est posée telle quelle à un élève, des semaines plus tard, sans rien autour. Écris donc chacune comme si c'était la première phrase qu'on lit sur le sujet.

Concrètement, aucune notion ne commence ni ne continue par un renvoi vers l'extérieur : pas de « ce », « cette », « ces », « cet », « il », « elle », « y », « en » qui désignent quelque chose d'absent de la phrase, pas de « comme vu plus haut », pas de « cette période », pas de « ces améliorations ». Nomme ce dont tu parles à chaque fois, quitte à répéter.

**Ne range rien dans un chapitre** : à ce stade il n'y en a pas, et ce n'est pas ton travail ici.

RÉUTILISE plutôt que de recréer. Avant d'écrire une notion, cherche dans la liste ci-dessus si le fait y est déjà.

**Cherche sur les FAITS, pas sur les phrases.** Compare ce que la notion contient — les chiffres, les noms propres, les dates, les termes techniques — et non la façon dont elle est tournée. Une notion existante qui énonce les mêmes éléments dans un ORDRE DIFFÉRENT, ou avec des SYNONYMES, reste la même notion : c'est ainsi que passent la plupart des doublons.

Ne produis une notion voisine d'une existante QUE si elle apporte un FAIT VÉRIFIABLE DE PLUS : quelque chose qu'on pourrait demander à un élève et dont la réponse ne figure pas dans l'ancienne.

À produire : « L'imprimerie de Gutenberg apparaît vers 1450 » existe déjà, et le document explique qu'elle repose sur des caractères métalliques mobiles → tu écris cette seconde notion, qui porte un fait qu'aucune question ne pouvait atteindre jusque-là.
À ne pas produire : « Le solstice d'hiver est le jour le plus court de l'année » existe déjà, et tu écris « La nuit du solstice d'hiver est la plus longue de l'année » → même fait, autres mots. Tu ne produis rien.

Dans le doute, ne produis pas : une notion manquante se rattrape au prochain import, un doublon reste et encombre l'atelier.`;
}

/** Passe 3 — le RANGEMENT d'un lot de notions.
 *
 *  ⚠️ **Elle ne reçoit aucun document**, et c'est tout son intérêt. Ce qui
 *  remplace le cours, ce sont deux nombres : la page d'où vient la notion, et
 *  les pages que couvre le chapitre. Renvoyer le corpus pour décider où va une
 *  notion d’une phrase serait refaire l'erreur de coût du 22/08/2026.
 *
 *  ⚠️ **La page indique, le contenu décide.** Un chapitre ne s'arrête pas au bas
 *  d'une page : une notion du haut de la page 40 appartient souvent encore au
 *  chapitre précédent. Si l'indication était donnée comme une règle, le modèle
 *  rangerait mécaniquement au numéro et cesserait de lire la notion — on
 *  obtiendrait des rangements plausibles mais faux, c'est-à-dire invisibles à
 *  l'œil. La consigne dit donc explicitement qu'on peut s'en écarter.
 *
 *  ⚠️ **Les ressemblances sont SIGNALÉES, pas appliquées.** Le calcul (voir
 *  `duplicates.ts`) est bon pour repérer que deux phrases se ressemblent,
 *  mauvais pour juger si c'est une redite ou un fait de plus. C'est ici que ça
 *  se tranche, et le perdant n'est pas détruit : il reste sans chapitre. */
export function assignInstruction(input: {
  notions: {
    id: string;
    title: string;
    sourceDocument?: string | null;
    page?: number | null;
    currentChapterId?: string | null;
  }[];
  chapters: {
    id: string;
    name: string;
    sourceDocument?: string | null;
    pageStart?: number | null;
    pageEnd?: number | null;
  }[];
  similar: { notionId: string; other: string; proximity: number }[];
}): string {
  const chapters = input.chapters.length === 0
    ? "Aucun chapitre n'existe : laisse toutes les notions sans chapitre."
    : input.chapters
        .map((c) => {
          // Même forme que la provenance d'une notion — ` [document, page N] ` —
          // pour que les deux listes se lisent de la même façon (31/08/2026).
          const span = c.pageStart && c.pageEnd
            ? ` [${c.sourceDocument ? `${c.sourceDocument}, ` : ''}pages ~${c.pageStart} à ~${c.pageEnd}]`
            : '';
          return `- ${c.id} — ${c.name}${span}`;
        })
        .join('\n');

  const notions = input.notions
    .map((n) => {
      const from = n.page ? ` [${n.sourceDocument ?? 'document'}, page ${n.page}]` : '';
      const now = n.currentChapterId ? ` (actuellement dans ${n.currentChapterId})` : '';
      return `- ${n.id} — ${n.title}${from}${now}`;
    })
    .join('\n');

  const doubts = input.similar.length === 0
    ? ''
    : `

RESSEMBLANCES REPÉRÉES. Un calcul automatique a trouvé que ces notions ressemblent à une notion déjà présente dans l'atelier. **Ce calcul ne juge rien** : il compare des mots, il ne sait pas si c'est le même fait. C'est à toi de trancher, notion par notion.

${input.similar.map((s) => `- ${s.notionId} ressemble à : « ${s.other} »`).join('\n')}

Pour chacune :
- si elle SE DÉMARQUE VRAIMENT malgré la ressemblance — elle porte un fait qu'on pourrait demander à part, et dont la réponse est absente de l'autre —, les deux ont leur place : range-la normalement ;
- si elle dit la même chose autrement, c'est une redite : donne-lui un chapitre VIDE. Elle ne sera pas perdue, elle sortira simplement du programme.

**Quand c'est une redite, c'est toujours celle de cette liste qui s'efface**, jamais l'autre : la notion déjà présente peut porter des questions et un historique de révision, et rien ici ne permet d'en juger.

⚠️ **La page ne prouve JAMAIS que deux notions sont différentes.** Un cours énonce souvent le même fait à deux endroits — une fois en introduction, une fois en conclusion — et les deux extractions n'en font qu'une seule notion. Ne te sers de la page que pour RANGER, jamais pour juger si deux notions se distinguent : ça se décide sur le contenu, et sur lui seul.`;

  return `Range chaque notion de cette liste dans le chapitre qui lui convient.

LES CHAPITRES DISPONIBLES :
${chapters}

LES NOTIONS À RANGER :
${notions}

La mention « actuellement dans » dit où la notion se trouve aujourd'hui. **C'est une information, pas une consigne** : tu peux parfaitement la déplacer si un autre chapitre lui convient mieux, et reconduire son rangement est tout aussi valide. Elle est surtout utile quand la notion n'a **aucune provenance** — sans page ni document, c'est parfois le seul indice disponible. Ne la laisse jamais l'emporter sur le contenu.

Les pages sont **une indication, pas une règle**. Un chapitre ne s'arrête pas proprement au bas d'une page : une notion du haut d'une page peut très bien appartenir au chapitre précédent, et une notion isolée peut relever d'un chapitre situé ailleurs dans le cours. **En cas de désaccord entre la page et le contenu, c'est le contenu qui décide.** Une notion sans page se range sur son seul contenu.

Trois règles :
- **Tu ne peux ni créer ni modifier une notion, ni créer un chapitre.** Tu ranges ce qui existe. N'invente aucune référence, recopie-les à l'identique.
- **Réponds pour CHAQUE notion de la liste, sans exception.**
- **Une notion qui n'a sa place dans aucun chapitre reçoit un chapitre vide.** Elle reste consultable, hors du programme.${doubts}`;
}

/** La règle de volumétrie, en une phrase pour le modèle. Un niveau à zéro n'y
 *  figure pas du tout : le mentionner pour dire « aucune » attire l'attention
 *  sur ce qu'on ne veut justement pas voir produit. */
export function bloomInstruction(distribution: BloomDistribution = DEFAULT_BLOOM_DISTRIBUTION): string {
  const parts = BLOOM_LEVELS.filter((level) => distribution[level] > 0).map(
    (level) => `${distribution[level]} de niveau ${level} (${BLOOM_VERBS[level]})`,
  );
  if (parts.length === 0) return 'Ne produis aucune question.';

  const total = questionsPerNotion(distribution);
  const enumeration = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
  return `Pour CHAQUE notion à couvrir : ${enumeration}, soit ${total} questions par notion. Ce niveau est celui que tu inscris à côté de la notion dans \`notions\`. N'en produis pas d'autres niveaux.`;
}

/** Le TEMPS DE RÉPONSE visé, par niveau de Bloom (arbitrage du 25/08/2026).
 *
 *  C'est le réglage le plus concret qu'on sache donner sur l'AMPLEUR d'une
 *  question. « Niveau 2 » ne dit rien de la longueur attendue ; « 30 secondes à
 *  une minute » la dicte — la taille de l'énoncé, le nombre de propositions, ce
 *  qu'on demande de produire. Sans lui, le modèle écrit au bon niveau mais au
 *  format qu'il veut, et un entraînement se met à ressembler à un devoir.
 *
 *  ⚠️ Ces durées sont celles du PARCOURS, qui s'enchaîne. L'examen vise plus
 *  long, et sa règle est écrite dans `examInstruction` : ses questions croisent
 *  plusieurs notions et vivent aux niveaux 3 et 4, où l'on attend un
 *  raisonnement construit, pas un réflexe. */
const PARCOURS_PACE: Record<BloomLevel, string> = {
  1: '15 à 30 secondes',
  2: '30 secondes à 1 minute',
  3: '1 à 2 minutes',
  4: '2 à 4 minutes',
};

/** La règle de rythme du parcours, limitée aux niveaux réellement demandés :
 *  annoncer une durée pour un niveau qu'on ne produit pas attirerait l'attention
 *  sur ce qu'on ne veut justement pas voir. */
export function paceInstruction(distribution: BloomDistribution = DEFAULT_BLOOM_DISTRIBUTION): string {
  return paceForLevels(BLOOM_LEVELS.filter((level) => distribution[level] > 0));
}

/** La même règle, à partir des niveaux réellement demandés — la forme qu'il
 *  faut quand la volumétrie vient d'une demande explicite et non d'une
 *  répartition (voir @/lib/ingest/demand). */
export function paceForLevels(levels: BloomLevel[]): string {
  const wanted = BLOOM_LEVELS.filter((level) => levels.includes(level));
  const parts = wanted.map((level) => `${PARCOURS_PACE[level]} au niveau ${level}`);
  if (parts.length === 0) return '';
  return `**Un entraînement s'enchaîne** : vise ${parts.join(', ')}. C'est le temps de réponse attendu, et c'est lui qui dicte l'ampleur de l'énoncé comme celle de la réponse.`;
}

/** La règle de ressemblance entre questions, commune aux deux listes.
 *
 *  ⚠️ **Elle est l'INVERSE de celle des notions, et ce n'est pas une
 *  incohérence** (arbitrage du 24/08/2026). Deux notions qui disent la même
 *  chose sont un doublon à éliminer ; deux questions qui font travailler le même
 *  fait sont exactement ce qu'on veut — on n'apprend pas une addition en la
 *  posant une seule fois. « Combien font 5 + 2 » et « combien font 5 + 1 » sont
 *  deux questions, pas un doublon.
 *
 *  Conséquence assumée : **on ne vérifie nulle part la similarité entre
 *  questions**. Le calcul de ressemblance (`duplicates.ts`) ne sert qu'aux
 *  notions. Ici, la seule exigence est de varier autant que possible, et de
 *  reformuler au minimum. */
const VARIATION_RULE =
  "Deux questions peuvent porter sur le même fait — c'est même souhaitable, on n'apprend pas en répondant une seule fois. Mais elles doivent DIFFÉRER : change l'angle, l'exemple, les valeurs, la forme de la réponse. Reformuler à l'identique ne compte pas comme une question de plus.";

/** La même règle, retournée pour l'examen (31/08/2026).
 *
 *  ⚠️ **On n'apprend pas pendant un examen.** La répétition, qui est la raison
 *  d'être du parcours, y devient du gâchis : le budget est fixe et une place
 *  prise par un fait déjà évalué est une place perdue pour tout le reste du
 *  programme. La consigne ne l'interdit pas — deux questions peuvent
 *  légitimement toucher la même notion sous deux angles —, elle inverse
 *  simplement l'incitation. */
const EXAM_VARIATION_RULE =
  "**Chaque question ouvre un terrain NOUVEAU.** Le budget est fixe : une question qui réévalue ce qu'une autre a déjà évalué est une place perdue pour le reste du programme. Deux questions peuvent toucher la même notion, mais jamais sous le même angle ni sur le même fait.";

/** Le catalogue des types de réponse, tel qu'on le pose au modèle.
 *
 *  ─── Pourquoi il est écrit ici et pas déduit du schéma ─────────────────────
 *
 *  Le schéma dit ce qui est ACCEPTÉ ; cette liste dit à quoi chaque type SERT.
 *  Un modèle à qui l'on n'ouvre qu'une énumération se rabat sur le QCM et la
 *  réponse rédigée, parce que ce sont les seuls dont il devine l'usage sans
 *  qu'on le lui dise. Ouvrir les types sans les expliquer n'aurait donc rien
 *  changé au résultat.
 *
 *  ─── Ce que la mention « corrigé automatiquement » fait là ─────────────────
 *
 *  En entraînement, seuls le QCM, la liste, le tableau et les paires sont jugés
 *  par la machine, et **un énoncé n'accorde de progression sur sa notion que
 *  s'il a été jugé juste**. Un chapitre entièrement rédigé en réponses libres
 *  ne ferait donc progresser personne. C'est une contrainte de fonctionnement,
 *  pas une préférence de style : elle est dite au modèle comme telle.
 *
 *  À l'examen, la copie est relue par un humain — la distinction n'a pas cours,
 *  et deux types de plus s'ouvrent : le dépôt de fichier et l'énoncé sans
 *  réponse attendue. */
function responseTypeCatalog(context: 'parcours' | 'exam'): string {
  const intro = "**Choisis le type de réponse d'après ce que la question demande**, et varie-les :";
  const common = [
    // Les règles du QCM sont écrites AVEC le QCM (01/09/2026). Elles vivaient
    // trente lignes plus bas, mêlées aux règles générales : on lisait le type,
    // puis on croisait ses contraintes bien après avoir cessé d'y penser.
    `- \`qcm\` — propositions à cocher (\`choices\`, et \`correctChoices\` pour les index des justes ; il peut n'y en avoir qu'un). Deux propositions au minimum, aucune vide. **Les fausses doivent être PLAUSIBLES** — une proposition manifestement absurde ne teste rien, elle se raye d'office — **et fausses par rapport ${context === 'exam' ? 'aux notions ci-dessus' : 'à la notion'}** : aucune n'affirme un fait extérieur, ni vrai ni faux, que rien ici ne permet de vérifier. C'est par les propositions fausses qu'une invention entre le plus facilement, et personne ne la relira. Pas de « toutes les réponses ci-dessus », pas de « aucune de ces réponses ».`,
    '- `textuelle` — réponse rédigée. `answer` porte la réponse attendue.',
    "- `liste` — plusieurs réponses courtes : `choices` porte TOUTES les réponses acceptées, UNE PAR ENTRÉE. Favorise les plus courtes possible — un mot, un nom, une date : la comparaison ignore la casse, les accents, la ponctuation et l'article de tête, mais rien d'autre, et une phrase ne se retrouve jamais à l'identique. Deux réglages : `typeOptions.listExpected`, le nombre de réponses réellement demandées quand tu n'attends pas la liste complète — « cite trois fleuves français » se rédige avec les huit réponses acceptées et 3 ici ; et `listNumbered` à vrai quand l'ordre des réponses COMPTE et doit être celui de ta liste, sinon le candidat répond dans l'ordre qu'il veut.",
    "- `tableau` — grille de cases à cocher. `typeOptions.tableRows` (les lignes), `tableCols` (les colonnes), `tableCorrect` (par ligne, dans l'ordre des lignes, les index des colonnes justes). Sans lignes ni colonnes, la question est jetée.",
    '- `matching` — relier deux colonnes. `pairs` porte les paires DÉJÀ APPARIÉES ; elles seront mélangées à l’affichage, ne les brouille pas toi-même. Deux paires au minimum.',
    "- `dessin` — tracer un schéma à main levée. `answer` décrit ce qui est attendu. À réserver aux notions qui se dessinent réellement (un schéma, un axe, une carte) — jamais comme façon détournée de faire écrire.",
  ];

  // Le niveau de Bloom oriente le type, sans le commander — d'où « repère » et
  // non « règle ». Le formuler comme une contrainte produirait mécaniquement des
  // QCM au niveau 1 et des rédactions au niveau 4, alors que la bonne question
  // est parfois l'inverse (une chronologie à remettre en ordre au niveau 4, une
  // définition à écrire au niveau 1).
  const bloomHint =
    "**Un repère pour choisir, pas une règle.** Le niveau visé oriente la forme de la réponse, et l'échelle se lit comme un dégradé : au niveau 1 (reconnaître), la réponse SE CHOISIT presque toujours — QCM, grille et paires font exactement le travail. Au niveau 4 (analyser), elle S'ÉCRIT presque toujours : rien d'autre ne montre le raisonnement. Les niveaux 2 et 3 vont des deux côtés, à peu près à parts égales.";

  // ⚠️ **Des plafonds, pas des cibles**, et c'est écrit ainsi : annoncer « 20 »
  // sans le dire ferait converger le modèle vers 20 propositions par QCM.
  const caps = `**Ces nombres sont des PLAFONDS, jamais des objectifs** : au plus ${MAX_CHOICES} propositions à un QCM, ${MAX_CHOICES} réponses à une liste, ${MAX_TABLE_ROWS} lignes et ${MAX_TABLE_COLS} colonnes à une grille, ${MAX_PAIRS} paires à un appariement. Une bonne question en compte presque toujours beaucoup moins ; ce qui dépasse est coupé.`;

  if (context === 'exam') {
    return [
      intro,
      ...common,
      "- `fichier` — le candidat dépose un document. `typeOptions.fileTypes` restreint les formats acceptés (`pdf`, `image`, `word`, `excel`, `ppt`, `txt`, `audio`, `video`, `zip`) ; sans réglage, tous le sont. Pour un livrable — **n'en produis pas de toi-même, seulement si l'utilisateur en demande**.",
      "- `sans_reponse` — rien à rendre SUR CETTE COPIE : une consigne, un préambule, le décor d'un groupe, ou une tâche qui s'exécute ailleurs et que le correcteur observe (réaliser un mouvement, manipuler un instrument, présenter à l'oral). **N'en produis pas de toi-même, seulement si l'utilisateur en demande.**",
      `- Pour une réponse rédigée, \`textLines\` donne le nombre de lignes laissées sur la copie (${MAX_TEXT_LINES} au maximum). Compte ce qu'une bonne réponse y occupe réellement.`,
      '',
      caps,
      '',
      bloomHint,
    ].join('\n');
  }

  return [
    intro,
    ...common,
    '',
    caps,
    '',
    bloomHint,
    '',
    '**Favorise des réponses rédigées concises** — un terme, une date, un nom, quelques mots plutôt qu’une phrase construite. Un entraînement s’enchaîne, et une réponse courte se compare à ce que porte `answer` sans ambiguïté.',
  ].join('\n');
}

/** Passe 3 — les questions d'un lot de notions, ancrées sur elles. */
export function questionsInstruction(input: {
  chapter: { id: string; name: string };
  workshop?: WorkshopIdentity | null;
  /** `want` porte la DEMANDE explicite : ce qu'il faut produire sur cette
   *  notion, niveau par niveau. Présente pour un chapitre neuf comme pour une
   *  recharge ; absente pour une consigne libre, où le modèle choisit
   *  (voir @/lib/ingest/demand). */
  notions: {
    id: string;
    title: string;
    missing?: number;
    want?: { bloomLevel: BloomLevel; count: number }[];
  }[];
  /** Les autres notions du chapitre, en contexte seulement (§16.21). La passe ne
   *  reçoit plus les documents : ce sont elles qui remplacent le cours. */
  neighbours?: { id: string; title: string }[];
  /** Nombre de questions restant avant le plafond de l'import. */
  budget: number;
  /** Répartition visée par niveau de Bloom. Paramétrable pour pouvoir la régler
   *  sans toucher au prompt (§16.1). */
  distribution?: BloomDistribution;
}): string {
  // Le nombre qui MANQUE, et non le nombre déjà écrit : c'est ce que le modèle
  // doit produire, et le lui faire calculer serait une soustraction de plus à
  // rater. Absent quand la notion part de zéro — dire « ajoute 12 » à côté d'une
  // consigne qui dit déjà 12 n'apporte rien et brouille la règle générale.
  const list = input.notions
    .map((n) => {
      // La demande explicite prime : elle dit le nombre ET le niveau, il n'y a
      // plus rien à déduire d'une règle générale.
      if (n.want && n.want.length > 0) {
        const parts = n.want.map((w) => `${w.count} de niveau ${w.bloomLevel} (${BLOOM_VERBS[w.bloomLevel]})`);
        return `- ${n.id} — ${n.title} : ${parts.join(', ')}`;
      }
      const missing = typeof n.missing === 'number' && n.missing > 0 ? ` [il en manque ${n.missing}]` : '';
      return `- ${n.id} — ${n.title}${missing}`;
    })
    .join('\n');

  // Les niveaux réellement demandés, pour la règle de rythme : face à une
  // demande explicite, la répartition par défaut ne dit plus rien de juste.
  const wantedLevels = new Set<BloomLevel>(
    input.notions.flatMap((n) => (n.want ?? []).map((w) => w.bloomLevel)),
  );
  const hasDemand = wantedLevels.size > 0;
  const neighbours = input.neighbours ?? [];

  // Le contexte vient APRÈS les notions à couvrir et se termine par un rappel :
  // sans lui, le modèle interroge ce qu'il lit et déborde du lot.
  const context =
    neighbours.length > 0
      ? `\nAutres notions du même chapitre, pour le contexte UNIQUEMENT — tu ne poses aucune question dessus :
${neighbours.map((n) => `- ${n.title}`).join('\n')}
`
      : '';

  return `${workshopBlock(input.workshop)}Rédige les QUESTIONS D'ENTRAÎNEMENT qui font travailler les notions du chapitre « ${input.chapter.name} ».

Notions à couvrir :
${list}
${context}
Règles de production :
- N'excède pas ${input.budget} questions au total.
- ${hasDemand
    ? "**Produis exactement ce qui est demandé en face de chaque notion** — le nombre et le niveau y sont écrits. N'en ajoute pas, et ne produis aucun autre niveau."
    : bloomInstruction(input.distribution)}
- ${hasDemand
    ? "**Une question est écrite POUR une notion, au niveau demandé** : c'est ce niveau qui décide de ce qu'elle exige, avant même sa forme. Si elle en mobilise d'autres, déclare-les toutes — mais **aucune à un niveau supérieur à celui de sa notion principale**. Une question qui exige d'une notion secondaire plus que de sa notion principale ne pourra être posée à personne : elle serait hors de portée de ceux-là mêmes pour qui on l'écrit."
    : "**Une question, une notion.** Ici, une question est tirée pour réviser SA notion : elle doit se répondre avec elle et rien d'autre."}
- ${hasDemand ? paceForLevels([...wantedLevels]) : paceInstruction(input.distribution)}

${hasDemand
    ? bloomDefinitions([...wantedLevels])
    : bloomDefinitions(BLOOM_LEVELS.filter((level) => (input.distribution ?? DEFAULT_BLOOM_DISTRIBUTION)[level] > 0))}

${responseTypeCatalog('parcours')}
- **Pour un QCM, des propositions fausses PLAUSIBLES, et fausses PAR RAPPORT À LA NOTION.** Une proposition manifestement absurde ne teste rien, elle se raye d'office ; et aucune proposition n'affirme un fait extérieur — ni vrai ni faux — que rien ici ne permet de vérifier : c'est par les propositions fausses qu'une invention entre le plus facilement, et personne ne la relira.
- Pas de « toutes les réponses ci-dessus », pas de « aucune de ces réponses », pas d'énoncé à la forme négative : ce sont des tests de lecture, pas de connaissance.
- ${VARIATION_RULE}
- **Une question est seule dans son groupe, sauf si elle est indissociable d'une autre.** C'est le cas normal, et de très loin le plus fréquent. N'en fais jamais un procédé : un groupe dont les questions tiendraient seules n'est pas un groupe.
- Quand tu en fais un, il se conçoit d'un bloc : tu poses une situation, puis les deux ou trois questions qui l'exploitent. Un groupe n'a pas d'énoncé commun séparé — tout ce qui est nécessaire à une question est écrit dans les précédentes. Les questions se répondent dans l'ordre : la PREMIÈRE pose le décor, les suivantes s'appuient dessus sans le répéter. Elles seront toujours posées ensemble et dans cet ordre. C'est la seule exception à la règle d'autonomie : c'est le GROUPE qui se comprend seul, pas chacune de ses questions.

Ce que chaque question doit porter en plus de son énoncé :
- Dans \`notions\`, la ou les notions qu'elle fait travailler, avec les références ci-dessus, **et pour chacune le niveau auquel cette question-là la fait travailler.** Le niveau se déclare notion par notion, pas pour la question : écris l'énoncé, regarde ce qu'il mobilise, puis dis ce qu'il demande de chaque notion — une même question peut faire simplement RECONNAÎTRE une notion de contexte et faire APPLIQUER celle qui est réellement en jeu. Ne mets pas toutes les notions au même niveau par facilité. Une question sans notion ne sera jamais posée à personne.
- Dans \`expectations\`, les critères de correction : ce qui est attendu, ce qui est accepté, ce qui ne l'est pas. C'est là-dessus que la réponse sera jugée.

Une bonne question se répond avec la notion et rien d'autre : ni piège de formulation, ni connaissance extérieure au document.`;
}

/** Passe EXAMEN — un nombre fixe de questions pour tout le programme.
 *
 *  ⚠️ **La forme négative est interdite au parcours, tolérée ici** (25/08/2026).
 *  « Laquelle n'est PAS vraie ? » teste la lecture plus que la connaissance :
 *  en entraînement, où la correction est automatique et où l'on mesure une
 *  maîtrise, on ne saurait pas distinguer « a mal lu » de « ne sait pas ». Un
 *  examen, lui, cherche à départager — on ne l'encourage donc pas, on cesse
 *  simplement de l'interdire, et rien dans la consigne ne la met en avant.
 *
 *  ─── Ce qui la sépare de la passe parcours ─────────────────────────────────
 *
 *  Tout, sauf le format de sortie. Elle ne raisonne pas par notion mais par
 *  PROGRAMME : elle reçoit une tranche entière (des chapitres avec leurs
 *  notions) et un budget de questions, à elle de choisir où frapper. Une
 *  question d'examen croise plusieurs notions — c'est ce croisement qui fait la
 *  difficulté, et c'est ce que le parcours ne produit jamais.
 *
 *  ─── Les groupes, et l'exception qu'ils font à la règle d'autonomie ────────
 *
 *  Le bloc système exige qu'une question se comprenne seule. Un groupe la
 *  contredit délibérément : ses questions s'enchaînent et la première pose le
 *  décor. L'exception doit être ÉCRITE ici, sinon le modèle tranche en faveur
 *  de la règle générale et rend des groupes dont les questions sont
 *  indépendantes — c'est-à-dire pas des groupes.
 *
 *  ⚠️ Un groupe ne porte **aucun énoncé commun** : la base n'en a pas (elle ne
 *  partage qu'une image ou un son), et on a choisi de ne pas en ajouter
 *  (24/08/2026). Le contexte vit donc dans la PREMIÈRE question du groupe. */
export function examInstruction(input: {
  workshop?: WorkshopIdentity | null;
  /** La tranche de programme couverte par CET appel, dans l'ordre du cours. */
  chapters: { name: string; notions: { id: string; title: string }[] }[];
  /** Nombre de questions à écrire dans cet appel. */
  budget: number;
}): string {
  const program = input.chapters
    .map((c) => `## ${c.name}\n${c.notions.map((n) => `- ${n.id} — ${n.title}`).join('\n')}`)
    .join('\n\n');

  // En PROPORTIONS et non en nombres depuis le 28/08/2026 : le niveau porte sur
  // le couple question ↔ notion, et une question d'examen en croise plusieurs.
  // Annoncer « 10 de niveau 2 » sur un budget de 40 questions laisserait croire
  // qu'on compte des questions.
  const mix = ([2, 3, 4] as const)
    .filter((level) => EXAM_BLOOM_MIX[level] > 0)
    .map((level) => `${Math.round(EXAM_BLOOM_MIX[level] * 100)} % de niveau ${level} (${BLOOM_VERBS[level]})`)
    .join(', ');

  const grouped = examGroupedCount(input.budget);
  const groups =
    grouped >= EXAM_GROUP_SIZE.min
      ? `- **Un GROUPE se conçoit d'un bloc**, jamais en rapprochant des questions déjà écrites : tu poses une situation — un cas, un extrait, un jeu de données, un document — puis tu écris les ${EXAM_GROUP_SIZE.min} à ${EXAM_GROUP_SIZE.max} questions qui l'exploitent tour à tour. Des questions qui tiendraient seules ne font pas un groupe.
- Vise environ ${grouped} questions réparties dans de tels groupes — un ordre de grandeur, pas une règle —, le reste étant des questions isolées (un groupe d'une seule question).
- **Écris les GROUPES EN PREMIER**, les questions isolées ensuite. Si le compte doit être coupé, il le sera par la fin : un groupe entamé en dernier perdrait ses dernières questions, et l'enchaînement avec.
- Un groupe n'a pas d'énoncé commun séparé : tout ce qui est nécessaire à une question est écrit dans les précédentes. Les questions se répondent dans l'ordre : la PREMIÈRE pose le décor, les suivantes s'appuient dessus sans le répéter. Elles seront toujours présentées ensemble et dans cet ordre. C'est la seule exception à la règle d'autonomie : c'est le GROUPE qui se comprend seul, pas chacune de ses questions.`
      : '- Chaque groupe ne contient qu\'une question : le budget de cet appel est trop court pour un enchaînement.';

  return `${workshopBlock(input.workshop)}Rédige les QUESTIONS D'EXAMEN qui évaluent cette partie du programme.

Un examen n'est pas un entraînement : il ÉCHANTILLONNE. Tu ne couvres pas toutes les notions ci-dessous — tu choisis celles qui méritent d'être évaluées, et tu les fais travailler ENSEMBLE.

LE PROGRAMME À ÉVALUER :

${program}

Règles de production :
- Écris **exactement ${input.budget} questions**, pas une de plus.
- **Trois questions sur quatre au moins croisent PLUSIEURS notions.** C'est ce croisement qui distingue un examen d'une série de questions de cours. Une question qui ne porte que sur une seule notion reste possible, mais elle est minoritaire.
- Répartition visée sur l'ensemble des couples question ↔ notion : ${mix}. Aucun couple de simple reconnaissance : le parcours s'en charge.

${bloomDefinitions([2, 3, 4])}

${groups}
${responseTypeCatalog('exam')}
- **Une question d'examen se donne plus de temps qu'une question d'entraînement du même niveau** : compte 1 à 2 minutes au niveau 2, 3 à 5 minutes aux niveaux 3 et 4. C'est ce temps qui autorise un énoncé plus fourni et une réponse construite.
- **Pour un QCM, des propositions fausses PLAUSIBLES, et fausses PAR RAPPORT AUX NOTIONS ci-dessus.** Une proposition manifestement absurde ne teste rien ; et aucune proposition n'affirme un fait extérieur — ni vrai ni faux — que rien ici ne permet de vérifier.
- Pas de « toutes les réponses ci-dessus », pas de « aucune de ces réponses ».
- ${EXAM_VARIATION_RULE}

Ce que chaque question doit porter en plus de son énoncé :
- Dans \`notions\`, TOUTES les notions qu'elle fait travailler, avec les références ci-dessus, **et pour chacune le niveau auquel cette question-là la fait travailler** — écris l'énoncé, regarde ce qu'il mobilise, puis dis ce qu'il demande de chaque notion : une même question peut faire simplement RESTITUER une notion de contexte et faire ANALYSER celle qui est réellement en jeu. Ne mets pas toutes les notions au même niveau par facilité. Une question sans notion ne sera jamais retenue.
- Dans \`expectations\`, les critères de correction : ce qui est attendu, ce qui est accepté, ce qui ne l'est pas. C'est ce que le correcteur aura sous les yeux.

Tu n'inventes aucun fait : tout ce qu'une question demande doit se déduire des notions ci-dessus.`;
}
