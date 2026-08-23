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

/** Les quatre niveaux de Bloom qu'on sait produire, et ce qu'ils demandent. */
export const BLOOM_LEVELS = [1, 2, 3, 4] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

const BLOOM_VERBS: Record<BloomLevel, string> = {
  1: 'mémoriser',
  2: 'comprendre',
  3: 'appliquer',
  4: 'analyser ou créer',
};

/** Combien de questions viser par notion, **par niveau de Bloom**.
 *
 *  C'était « une par niveau », soit 4 — un stock qui s'épuise au deuxième
 *  entraînement, puisqu'un entraînement fait ~10 questions (§16.1). Les niveaux
 *  3 et 4 sont à zéro **par optimisation, pas par choix pédagogique** : les
 *  couvrir à cette densité demanderait ~60 questions par notion dont la plupart
 *  ne seraient jamais posées. Ils relèveront de la recharge automatique. */
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
 *  À 50, il bloquait à 2 % de la volumétrie cible (§16.2). Relevé à 300 **le
 *  temps des tests** : c'est un garde-fou contre une boucle qui part en vrille,
 *  il doit rester bas tant que les coûts réels ne sont pas constatés. */
export const MAX_QUESTIONS_PER_IMPORT = 300;

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
  | { pass: 'questions'; notionIds: string[] };

const SYSTEM = `Tu construis le programme pédagogique d'un atelier à partir de ses documents sources.

Tu produis une structure exploitable directement par l'application, jamais du commentaire : pas d'introduction, pas de conclusion, pas de remarque sur ton propre travail.

Trois exigences, dans cet ordre :

1. EXHAUSTIVITÉ. Tu couvres tout le document. Un passage non traité est une lacune invisible pour l'utilisateur : c'est la faute la plus grave que tu puisses commettre ici.
2. FIDÉLITÉ. Tu n'inventes rien qui ne soit dans le document. Si une information n'y est pas, elle n'existe pas.
3. AUTONOMIE. Chaque élément que tu produis doit se comprendre seul, sans le document sous les yeux : une notion est une phrase complète, une question se répond sans avoir lu ce qui précède.

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
      // Les chapitres existants ET TOUTES les notions : depuis l'inversion du
      // 23/08/2026, cette passe ne se contente plus de nommer des boîtes, elle
      // RÉPARTIT. Elle a donc besoin de la liste de ce qu'elle range — c'est
      // son entrée principale, pas un supplément.
      //
      // C'est aussi le seul endroit du pipeline qui voit toutes les notions
      // d'un coup : les redites entre deux documents ne peuvent se repérer que
      // là. La réponse reste dans le contrat — on en range une, on laisse
      // l'autre sans chapitre.
      return { chapters: existing.chapters, notions: existing.notions, questions: [] };
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
      case 'questions':
        return "Aucune question ne porte encore sur ces notions : la liste est vide.";
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

export function chaptersInstruction(
  fileNames: string[] = [],
  notions: { id: string; title: string }[] = [],
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
    ? `Tu viens de proposer ce découpage en ${retry.previous.length} parties :
${retry.previous.map((name, i) => `${i + 1}. ${name}`).join('\n')}

C'est au-delà de l'ordre de grandeur habituel. **Vérifie-le, ne le refais pas par principe.**

Deux issues, toutes deux acceptables :
- Le découpage est justifié — le cours couvre réellement autant de sujets distincts, ou l'utilisateur a demandé ce niveau de détail. **Reconduis-le tel quel**, en gardant les mêmes noms.
- Certaines de ces parties sont des SOUS-PARTIES d'une même unité — elles traitent du même sujet, ou s'enchaînent dans une même progression. Regroupe celles-là, et celles-là seulement.

Ne réduis pas ce qui n'a pas à l'être : un découpage juste que tu rabotes fait perdre du contenu, et rien ne le rattrapera ensuite.

`
    : '';

  return `${again}${corpus}Découpe ce cours en CHAPITRES : ses grandes parties, dans l'ordre où elles se lisent.

Un chapitre est une unité d'enseignement, pas une section de mise en page : deux sous-parties qui traitent du même sujet forment un seul chapitre. Vise le découpage qu'un enseignant ferait pour organiser sa progression.

**Le mot « chapitre » est le nôtre, pas celui du document.** Un cours nomme ses grandes parties comme il veut — thèmes, séquences, modules, parties, unités —, ou ne les nomme pas du tout. Ce qu'on te demande est un NIVEAU DE DÉCOUPAGE, pas la recherche d'un mot. Si le cours s'organise en thèmes contenant eux-mêmes des chapitres, les deux niveaux sont des découpages possibles : choisis celui qui correspond à la demande de l'utilisateur, et à défaut de demande, celui des grandes parties.

Ordre de grandeur : un cours en compte typiquement ${PLAUSIBLE_CHAPTERS.min} à ${PLAUSIBLE_CHAPTERS.max}, davantage pour un programme annuel ou un découpage fin explicitement demandé. C'est une indication et non une limite — dépasse-la si le contenu ou la demande le justifient.

Donne à chacun une référence courte et unique (ch1, ch2…), et un nom de 120 caractères maximum. Un chapitre qui existe déjà se réutilise en reprenant SA référence telle quelle, sans le recréer.

Puis RANGE LES NOTIONS. Elles ont été extraites avant les chapitres et n'appartiennent encore à aucun d'eux : c'est ici qu'on décide où chacune va.

Pour chaque notion de la liste, produis une affectation qui reprend sa référence à l'identique et donne le chapitre où la placer.

Trois règles :
- **Tu ne peux ni créer ni modifier une notion ici.** Tu ranges celles qui existent, rien d'autre. N'invente aucune référence.
- **Une notion qui n'a plus sa place dans le cours reçoit un chapitre vide** — elle sort du programme sans être perdue.
- **Deux notions qui disent la même chose** (elles viennent de documents différents qui se recouvrent) : range-en UNE, et laisse l'autre avec un chapitre vide. Ne les fusionne pas, ne les réécris pas.

N'oublie aucune notion : une notion absente de tes affectations reste là où elle est, ce qui n'est presque jamais ce que tu veux.

${notionsToArrange(notions)}`;
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

Une notion est l'unité minimale de connaissance : UNE idée, en UNE phrase de 280 caractères maximum, autoportante et vérifiable. « La Loire est le plus long fleuve de France » est une notion ; « Les fleuves » n'en est pas une, c'est un thème.

Découpe assez fin pour qu'on puisse interroger chaque notion séparément, mais pas au point de séparer une idée en deux moitiés qui ne veulent plus rien dire seules.

**Ne range rien dans un chapitre** : à ce stade il n'y en a pas, et ce n'est pas ton travail ici.

RÉUTILISE plutôt que de recréer. Avant d'écrire une notion, cherche dans la liste ci-dessus si le fait y est déjà.

**Cherche sur les FAITS, pas sur les phrases.** Compare ce que la notion contient — les chiffres, les noms propres, les dates, les termes techniques — et non la façon dont elle est tournée. Une notion existante qui énonce les mêmes éléments dans un ORDRE DIFFÉRENT, ou avec des SYNONYMES, reste la même notion : c'est ainsi que passent la plupart des doublons.

Ne produis une notion voisine d'une existante QUE si elle apporte un FAIT VÉRIFIABLE DE PLUS : quelque chose qu'on pourrait demander à un élève et dont la réponse ne figure pas dans l'ancienne.

Exemple de ce qu'il faut faire : « date de naissance de Napoléon » existe, le document donne aussi sa date de mort → tu produis « dates de naissance et de mort de Napoléon », qui porte un fait de plus.
Exemple de ce qu'il ne faut PAS faire : « le jour où la nuit est la plus longue » existe, tu écris « définition du solstice d'hiver » → même fait, autres mots, aucun ajout. Tu ne produis rien.

Dans le doute, ne produis pas : une notion manquante se rattrape au prochain import, un doublon reste et encombre l'atelier.`;
}

/** La liste des notions à répartir, telle que la passe chapitres la reçoit.
 *
 *  Séparée de la consigne parce qu'elle VARIE d'un appel à l'autre alors que la
 *  consigne, elle, est stable — la garder à part évite de croire qu'on peut
 *  mettre l'ensemble dans le préfixe mis en cache. */
export function notionsToArrange(notions: { id: string; title: string }[]): string {
  if (notions.length === 0) return "Aucune notion à répartir : l'atelier n'en contient pas encore.";
  const lines = notions.map((n) => `- ${n.id} — ${n.title}`);
  return `Les ${notions.length} notions à répartir (référence — texte) :
${lines.join('\n')}`;
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
  return `Pour CHAQUE notion à couvrir : ${enumeration}, soit ${total} questions par notion. N'en produis pas d'autres niveaux.`;
}

/** Passe 3 — les questions d'un lot de notions, ancrées sur elles. */
export function questionsInstruction(input: {
  chapter: { id: string; name: string };
  notions: { id: string; title: string }[];
  /** Les autres notions du chapitre, en contexte seulement (§16.21). La passe ne
   *  reçoit plus les documents : ce sont elles qui remplacent le cours. */
  neighbours?: { id: string; title: string }[];
  /** Nombre de questions restant avant le plafond de l'import. */
  budget: number;
  /** Répartition visée par niveau de Bloom. Paramétrable pour pouvoir la régler
   *  sans toucher au prompt (§16.1). */
  distribution?: BloomDistribution;
}): string {
  const list = input.notions.map((n) => `- ${n.id} — ${n.title}`).join('\n');
  const neighbours = input.neighbours ?? [];

  // Le contexte vient APRÈS les notions à couvrir et se termine par un rappel :
  // sans lui, le modèle interroge ce qu'il lit et déborde du lot.
  const context =
    neighbours.length > 0
      ? `\nAutres notions du même chapitre, pour le contexte UNIQUEMENT — tu ne poses aucune question dessus :
${neighbours.map((n) => `- ${n.title}`).join('\n')}
`
      : '';

  return `Rédige les QUESTIONS qui font travailler les notions du chapitre « ${input.chapter.name} ».

Notions à couvrir :
${list}
${context}
Règles de production :
- ${bloomInstruction(input.distribution)}
- Chaque question porte dans \`notionRefs\` la ou les notions qu'elle fait travailler, avec les références ci-dessus. Une question sans notion ne sera jamais posée à personne.
- Varie les types de réponse. Attention : \`qcs\` et \`qcm\` sont LE MÊME TYPE pour le candidat — un QCM, dont une seule ou plusieurs propositions sont correctes. Alterner entre les deux n'est pas varier : la variété se joue entre QCM, réponse textuelle et liste.
- Pour un QCM : des propositions fausses PLAUSIBLES. Une proposition manifestement absurde ne teste rien, elle se raye d'office.
- N'excède pas ${input.budget} questions au total.

Une bonne question se répond avec la notion et rien d'autre : ni piège de formulation, ni connaissance extérieure au document.`;
}
