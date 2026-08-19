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

/** Questions visées par notion : une par niveau de Bloom (décision du
 *  19/08/2026, confirmée le 20). Provisoire et assumé comme tel. */
export const QUESTIONS_PER_NOTION = 4;

/** Plafond de questions par ingestion. Plafond de DÉBIT, pas de notions : les
 *  notions sont la matière du produit, on ne les limite pas. La cible reste
 *  500 à 1000 (§9) — c'est pourquoi rien dans le pipeline ne suppose « tout le
 *  lot dans une seule réponse ». */
export const MAX_QUESTIONS_PER_IMPORT = 50;

export type ExistingContent = {
  chapters: { id: string; name: string }[];
  notions: { id: string; title: string; chapterId: string | null }[];
  /** Énoncés déjà présents — pour ne pas reposer la même question. */
  questions: string[];
};

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

/** L'existant de l'atelier, transmis à CHAQUE appel pour que le modèle complète
 *  au lieu de dupliquer (§8). Les identifiants réels servent de références : une
 *  question peut ainsi se rattacher à une notion déjà en base. */
export function existingContentBlock(existing: ExistingContent): string {
  if (existing.chapters.length === 0 && existing.notions.length === 0 && existing.questions.length === 0) {
    return "L'atelier est vide : rien n'existe encore.";
  }

  const lines: string[] = ["Ce qui existe DÉJÀ dans l'atelier. Tu ne le recrées pas ; tu le complètes."];

  if (existing.chapters.length > 0) {
    lines.push('', 'Chapitres (référence — nom) :');
    for (const c of existing.chapters) lines.push(`- ${c.id} — ${c.name}`);
  }

  if (existing.notions.length > 0) {
    lines.push('', 'Notions (référence — texte) :');
    for (const n of existing.notions) lines.push(`- ${n.id} — ${n.title}`);
  }

  if (existing.questions.length > 0) {
    lines.push('', 'Questions déjà posées — ne les repose pas, même reformulées :');
    for (const q of existing.questions) lines.push(`- ${q}`);
  }

  return lines.join('\n');
}

/** Passe 1 — les chapitres. */
export function chaptersInstruction(): string {
  return `Découpe le document en CHAPITRES : les grandes parties du cours, dans l'ordre où elles se lisent.

Un chapitre est une unité d'enseignement, pas une section de mise en page : deux sous-parties qui traitent du même sujet forment un seul chapitre. Vise le découpage qu'un enseignant ferait pour organiser sa progression.

Donne à chacun une référence courte et unique (ch1, ch2…), et un nom de 120 caractères maximum.`;
}

/** Passe 2 — les notions d'un chapitre. */
export function notionsInstruction(chapter: { id: string; name: string }): string {
  return `Extrais les NOTIONS du chapitre « ${chapter.name} » (référence : ${chapter.id}).

Une notion est l'unité minimale de connaissance : UNE idée, en UNE phrase de 280 caractères maximum, autoportante et vérifiable. « La Loire est le plus long fleuve de France » est une notion ; « Les fleuves » n'en est pas une, c'est un thème.

Découpe assez fin pour qu'on puisse interroger chaque notion séparément, mais pas au point de séparer une idée en deux moitiés qui ne veulent plus rien dire seules.

Chaque notion porte \`chapterRef\` = ${chapter.id}. Ne produis que les notions de CE chapitre.`;
}

/** Passe 3 — les questions d'un chapitre, ancrées sur ses notions. */
export function questionsInstruction(input: {
  chapter: { id: string; name: string };
  notions: { id: string; title: string }[];
  /** Nombre de questions restant avant le plafond de l'import. */
  budget: number;
}): string {
  const list = input.notions.map((n) => `- ${n.id} — ${n.title}`).join('\n');

  return `Rédige les QUESTIONS qui font travailler les notions du chapitre « ${input.chapter.name} ».

Notions à couvrir :
${list}

Règles de production :
- ${QUESTIONS_PER_NOTION} questions par notion, une par niveau de Bloom : 1 mémoriser, 2 comprendre, 3 appliquer, 4 analyser ou créer.
- Chaque question porte dans \`notionRefs\` la ou les notions qu'elle fait travailler, avec les références ci-dessus. Une question sans notion ne sera jamais posée à personne.
- Varie les types de réponse. Une suite de QCM sur un même chapitre lasse et n'évalue qu'une seule chose.
- Pour un qcs ou un qcm : des propositions fausses PLAUSIBLES. Une proposition manifestement absurde ne teste rien.
- N'excède pas ${input.budget} questions au total.

Une bonne question se répond avec la notion et rien d'autre : ni piège de formulation, ni connaissance extérieure au document.`;
}
