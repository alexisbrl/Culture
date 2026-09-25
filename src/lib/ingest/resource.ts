// L'étape 0 : lire la consigne de l'utilisateur, et écrire la matière qui manque.
//
// ─── Ce qu'elle fait, et pourquoi elle est PREMIÈRE ──────────────────────────
//
// Toutes les autres étapes lisent des documents. Celle-ci lit une CONSIGNE, et
// c'est la seule. Elle en tire deux choses :
//
//   1. **Le document de l'IA** — un cours, un complément, une correction. Il
//      devient une ressource de l'atelier comme une autre, et toutes les étapes
//      suivantes le lisent au même titre que les documents déposés. C'est ce qui
//      permet à un atelier sans aucun cours d'en avoir un, et à un cours
//      incomplet d'être complété **sans être modifié**.
//   2. **La consigne réécrite** — celle que les étapes suivantes recevront,
//      débarrassée de ce qui ne les concerne pas.
//
// Elle doit donc passer avant tout le reste : ce qu'elle écrit est de la matière
// que les notions, les chapitres et les questions vont exploiter.
//
// ─── Décider, puis écrire une seule fois ─────────────────────────────────────
//
// Écrire ou non est une question fermée, tranchée AVANT l'appel par le décideur
// (@/lib/decision) — Jev à terme, Haiku en attendant (Alexis, 25/09/2026). Le
// modèle qui écrit reçoit la décision toute faite : tout le corpus quand il
// écrit, rien quand il ne fait que réécrire la consigne. Lui laisser le choix,
// c'était un premier appel à l'aveugle qui rédigeait un cours entier pour
// annoncer « j'écris », puis un second qui le réécrivait documents en main —
// plus de cinq minutes, coupées par l'hébergeur, le 24/09/2026.
//
// ─── Elle ne se déclenche que s'il y a une consigne ──────────────────────────
//
// Sans consigne, il n'y a rien à lire et rien à déduire : l'étape ne part pas,
// et ne coûte rien. C'est le cas de la grande majorité des générations.
//
// ─── Ce module-ci est PUR ────────────────────────────────────────────────────
//
// Il ne porte que la lecture de la réponse et la mise en forme du document.
// L'appel au modèle et les écritures vivent dans `run.ts` — ici, tout se teste
// sans base ni réseau, ce qui est la règle pour toute lecture d'une entrée non
// fiable (`CLAUDE.md` §7).

import { EXAM_QUESTIONS_RANGE, MAX_QUESTIONS_PER_IMPORT } from './prompt';

/** Un prompt qui n'est QUE des chiffres n'est pas une consigne : c'est un nombre
 *  de questions (décision d'Alexis du 04/09/2026). **Fonction pure.**
 *
 *  Elle remplace le champ « nombre de questions » qui vivait à côté du champ de
 *  consigne : deux façons de dire la même chose, dont une seule était visible
 *  selon le bouton d'entrée. Taper « 40 » suffit.
 *
 *  ⚠️ **Strictement des chiffres, et rien d'autre.** Ni espace, ni virgule, ni
 *  mot : « 40 questions » est une consigne, pas un nombre, et doit être lue par
 *  l'IA — elle porte une intention (« des questions », et non « des notions »)
 *  que le seul nombre ne porte pas. Les espaces autour sont ignorés : ils
 *  viennent de la frappe, pas d'une intention.
 *
 *  Quand elle rend un nombre, l'étape 0 **ne part pas du tout** : il n'y a rien
 *  à interpréter, rien à écrire, et la génération enchaîne directement sur le
 *  reste. Un appel au modèle économisé sur ce qui est probablement le réglage le
 *  plus courant.
 *
 *  Au-delà du plafond d'un import, on ne refuse pas : on ramène au plafond. Un
 *  utilisateur qui tape 5000 veut « beaucoup », pas une erreur. */
export function questionCountFromHint(hint: string): number | null {
  const trimmed = hint.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_QUESTIONS_PER_IMPORT);
}

/** Le nom du document, tel qu'il apparaît dans les ressources de l'atelier. */
export const GENERATED_FILE_NAME = 'Cours écrit par l’IA.md';

/** Le type du fichier écrit. Du texte : c'est lisible par le modèle sans
 *  conversion, téléchargeable par l'utilisateur, et ça pèse mille fois moins
 *  qu'un PDF fabriqué pour l'occasion. */
export const GENERATED_MIME_TYPE = 'text/markdown';

/** La marque qui sépare l'en-tête du corps.
 *
 *  ⚠️ **C'est nous qui écrivons l'en-tête, jamais le modèle.** Il doit être là à
 *  tous les coups — c'est ce qui rend le document reconnaissable comme écrit par
 *  une IA, par un humain comme par une machine — et un modèle à qui on demande
 *  de le reproduire finit un jour par ne pas le faire. On le pose à l'écriture,
 *  on le retire avant de rendre le document au modèle : il ne voit et ne rend
 *  jamais que le corps.
 *
 *  Un commentaire Markdown : invisible à la lecture, introuvable par hasard dans
 *  un texte rédigé. */
const BODY_MARKER = '<!-- culture:corps -->';

/** Le cap de longueur du document, en caractères.
 *
 *  Ce n'est pas une limite de qualité mais de faisabilité : le document est
 *  RÉÉCRIT en entier à chaque fois qu'il change, donc sa longueur est payée en
 *  sortie à chaque génération qui y touche — en temps de génération surtout, le
 *  coût en tokens restant marginal au regard de ce que le modèle accepte.
 *
 *  **40 000 caractères depuis le 25/09/2026** (Alexis) : ce qu'un seul appel
 *  écrit dans la durée d'une fonction serveur, cinq minutes. Mesuré le
 *  24/09/2026 : ~150 caractères par seconde, réflexion comprise (13 300 en 87 s,
 *  21 600 en 141 s), soit ~46 000 en 300 s — 40 000 garde de la marge pour une
 *  réflexion plus longue. Au-delà, l'étape est coupée, reprise une fois puis
 *  abandonnée, et le cours demandé n'arrive jamais.
 *
 *  ⚠️ **À relever dès que l'écriture pourra durer plus longtemps** — fonction
 *  plus longue, ou document écrit par parties (voir le backlog). 250 000 était
 *  l'objectif du 08/09/2026, l'ordre de grandeur d'un cours de 1 000 notions ;
 *  le plafond de réponse du modèle le permet (~71 000 jetons sur 128 000), c'est
 *  la durée qui ne le permet pas.
 *
 *  Ce plafond ne vise cependant PAS à loger un cours entier : la consigne dit
 *  explicitement de n'écrire que ce qui MANQUE (`resourceInstruction`), et « un
 *  cours de synthèse, pas un manuel » reste la limite qui compte le plus — la
 *  longueur n'est qu'un filet, pas un objectif. */
export const MAX_GENERATED_LENGTH = 40_000;

/** Ce que l'étape rend, une fois la réponse du modèle relue. */
export type ResourceOutcome = {
  /** `null` = ne pas toucher au document (rien à ajouter, ou rien à corriger).
   *  Une chaîne = le nouveau CORPS, en entier. */
  body: string | null;
  /** La consigne à transmettre aux étapes suivantes. Vide = il n'en reste rien
   *  qui les concerne, ce qui est un résultat parfaitement normal. */
  instruction: string;
  /** Une partie de la consigne a-t-elle été écartée comme hors-rôle ?
   *
   *  ⚠️ **Silencieux pour l'utilisateur** (décision d'Alexis du 04/09/2026) :
   *  rien ne s'affiche à l'écran. Mais l'information est enregistrée au journal
   *  de bord — c'est ce qui permettra de savoir si des gens s'en servent pour
   *  autre chose, sans transformer chaque maladresse en reproche. */
  dropped: boolean;
  /** Ce que le modèle dit avoir fait, en une phrase. Journal seulement. */
  summary: string;
  /** Le nombre de questions d'examen que le modèle a compris de la demande, s'il
   *  y en avait un. `null` = rien à en tirer, le réglage déjà en place s'applique.
   *
   *  ⚠️ **N'existe que pour l'examen** (04/09/2026) — le parcours ne connaît pas
   *  la notion de total, sa volumétrie est automatique par notion, et l'étape ne
   *  lui propose même pas ce champ (voir `resourceInstruction`, `context`). C'est
   *  ce qui répare le cas où l'utilisateur écrit sa quantité en toutes lettres
   *  (« une seule question ») plutôt qu'en chiffre nu (« 1 ») : le premier ne
   *  passait par aucune lecture et retombait donc, avant cette date, sur le
   *  défaut de 40 questions — indépendamment de ce qui était demandé. */
  examQuestionCount: number | null;
};

/** Relit la réponse du modèle. **Fonction pure**, et volontairement méfiante :
 *  tout ce qui n'est pas exploitable devient « ne touche à rien », jamais une
 *  exception. Une étape qui refuse d'écrire laisse la génération continuer ;
 *  une étape qui lève la fait échouer entière, pour un document optionnel.
 *
 *  ⚠️ **Le corps est tronqué, jamais refusé.** Un modèle qui déborde de 200
 *  caractères a quand même écrit un cours utilisable ; le jeter ferait perdre un
 *  appel cher pour un dépassement sans conséquence. La coupe est nette (aucune
 *  tentative de finir la phrase) et le journal enregistre qu'elle a eu lieu. */
export function readResourceOutput(raw: unknown): ResourceOutcome {
  const empty: ResourceOutcome = {
    body: null, instruction: '', dropped: false, summary: '', examQuestionCount: null,
  };
  if (!raw || typeof raw !== 'object') return empty;

  const value = raw as Record<string, unknown>;
  const document = (value.document ?? {}) as Record<string, unknown>;

  const instruction = typeof value.instruction === 'string' ? value.instruction.trim() : '';
  const dropped = value.dropped === true;
  const summary = typeof document.summary === 'string' ? document.summary.trim().slice(0, 300) : '';

  // Un corps n'existe que si l'écriture a été décidée en amont : le schéma
  // n'offre pas de champ `document` sinon. Vide ou mal formé, il vaut « ne
  // touche à rien », qui est toujours la conduite la moins dommageable.
  const body = typeof document.content === 'string' ? document.content.trim() : null;

  // Un entier hors bornes est ramené dans la plage plutôt que rejeté : demander
  // 5000 questions veut dire « beaucoup », pas « erreur » — même logique que
  // `questionCountFromHint`. Une valeur qui ne ressemble à rien (texte, décimal,
  // zéro ou négatif) vaut « aucune décision » : le réglage déjà en place reste.
  const rawCount = value.examQuestionCount;
  const examQuestionCount = typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount > 0
    ? Math.min(Math.max(rawCount, EXAM_QUESTIONS_RANGE.min), EXAM_QUESTIONS_RANGE.max)
    : null;

  return {
    body: body ? body.slice(0, MAX_GENERATED_LENGTH) : null,
    instruction,
    dropped,
    summary,
    examQuestionCount,
  };
}

/** Combien de titres du document de l'IA la question au décideur en montre au
 *  plus : de quoi reconnaître ce qu'il couvre déjà, sans lui faire lire le corps
 *  pour un oui ou un non. */
const OUTLINE_MAX_HEADINGS = 60;

/** La question fermée « faut-il écrire ? », posée au décideur AVANT l'appel qui
 *  écrit (docs/architecture.md §7.4). **Fonction pure.**
 *
 *  La situation ne porte que des noms et des titres, jamais le contenu d'un
 *  document : une décision de cette nature se prend sur la demande, et le
 *  décideur doit rester rapide. Dans le doute, c'est l'appel qui écrit qui lira
 *  tout — un « oui » de trop coûte une réécriture, un « non » de trop perd la
 *  demande de l'utilisateur. */
export function writingQuestion(input: {
  hint: string;
  workshop?: { name: string; description?: string | null } | null;
  chapters: { name: string }[];
  fileNames: string[];
  /** Le corps actuel du document de l'IA, s'il existe. Seuls ses titres partent. */
  current?: string | null;
}): { state: string; question: string } {
  const lines: string[] = [];
  const name = input.workshop?.name?.trim();
  if (name) {
    const description = (input.workshop?.description ?? '').trim();
    lines.push(`L'atelier : « ${name} »${description ? ` — ${description}` : ''}`);
  }
  lines.push(input.chapters.length > 0
    ? `Son programme :\n${input.chapters.map((c) => `- ${c.name}`).join('\n')}`
    : 'Son programme : vide, aucun chapitre.');
  lines.push(input.fileNames.length > 0
    ? `Les documents déposés par l'utilisateur :\n${input.fileNames.map((f) => `- ${f}`).join('\n')}`
    : "Les documents déposés par l'utilisateur : aucun.");

  const current = (input.current ?? '').trim();
  if (current) {
    const headings = current
      .split('\n')
      .filter((line) => /^#{1,6}\s/.test(line))
      .slice(0, OUTLINE_MAX_HEADINGS);
    lines.push(`Le cours déjà écrit par l'IA pour cet atelier (${current.length} caractères)${headings.length > 0 ? `, dont voici les titres :\n${headings.join('\n')}` : '.'}`);
  } else {
    lines.push("Le cours écrit par l'IA pour cet atelier : aucun pour l'instant.");
  }
  lines.push(`La demande de l'utilisateur :\n« ${input.hint.trim()} »`);

  return {
    state: lines.join('\n\n'),
    // ⚠️ **Posée comme un classement, pas comme « faut-il écrire ? »** (essai du
    // 25/09/2026, Haiku). Sous cette forme-là, il répondait oui à tout, y compris
    // à « des questions plus difficiles, en anglais ». ⚠️ **Modifier compte autant
    // que créer** : une première version ne nommait que les ajouts, et « retire
    // la partie sur les anecdotes » ou « réécris le cours en anglais » partaient
    // en « non » — la demande était perdue. Sous cette forme, à température
    // nulle, 18 sur 19 sur trois passages ; la seule erreur (« insiste sur les
    // éruptions », un cours de l'IA existant) va dans le sens coûteux.
    question: "Classe la demande. A : elle demande d'agir sur un COURS — en écrire un, le compléter, l'enrichir, le corriger, ou au contraire en retirer, raccourcir, simplifier, réécrire ou traduire une partie. B : elle ne porte que sur les questions à venir — leur difficulté, leur langue, leur type, les points sur lesquels insister, le contenu d'une question précise —, ou sur rien d'enseignable. La demande est-elle de type A ?",
  };
}

/** Le document complet, en-tête compris, tel qu'il est stocké et téléchargé. */
export function composeDocument(body: string, writtenAt: Date = new Date()): string {
  const date = writtenAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return [
    '# Cours écrit par l’IA',
    '',
    `> Ce document a été rédigé par l’IA de Culture à partir des consignes données à la génération, et mis à jour le ${date}.`,
    '> Il ne se modifie pas à la main : pour le corriger ou le compléter, redonnez une consigne à la génération.',
    '',
    BODY_MARKER,
    '',
    body.trim(),
    '',
  ].join('\n');
}

/** L'inverse : ce que le modèle doit relire, sans l'en-tête qu'il n'a pas écrit.
 *
 *  Un document sans marque est rendu tel quel — il vient d'une version
 *  antérieure du format, et le perdre serait pire que de laisser passer deux
 *  lignes d'en-tête. */
export function extractBody(document: string): string {
  const index = document.indexOf(BODY_MARKER);
  return (index === -1 ? document : document.slice(index + BODY_MARKER.length)).trim();
}
