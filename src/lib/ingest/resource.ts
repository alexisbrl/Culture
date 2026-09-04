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
// ─── Un seul appel, et pas deux ──────────────────────────────────────────────
//
// Analyser la consigne puis écrire le document auraient pu être deux étapes.
// Décision d'Alexis du 04/09/2026 : un seul appel. Les deux moitiés partagent
// exactement la même lecture — la consigne, le cours, le programme — et les
// séparer les ferait payer deux fois pour rien, en rallongeant une génération
// déjà longue.
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

import { MAX_QUESTIONS_PER_IMPORT } from './prompt';

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
 *  sortie à chaque génération qui y touche, et doit tenir sous le plafond de
 *  réponse. 40 000 caractères, c'est déjà une trentaine de pages — largement de
 *  quoi porter un cours de synthèse, ce que ce document est censé être. */
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
  /** Les documents qu'il réclame pour travailler, par numéro.
   *
   *  Non vide, l'étape rejoue son appel **une fois** avec ces documents joints.
   *  C'est ce qui permet de ne payer le cours que lorsqu'il faut réellement le
   *  lire — et non à chaque génération portant une consigne. */
  needs: number[];
};

// ⚠️ **Aucun plafond sur le nombre de documents demandés** (04/09/2026).
//
// Un plafond de quatre a existé une demi-journée, sur l'idée qu'un modèle
// réclamant « tout » ferait exactement ce qu'on cherche à éviter. Il était faux,
// et l'exemple qui l'a fait tomber (Alexis, même jour) est le cas le plus banal
// qui soit : « relis mon cours et corrige les erreurs ». Un professeur qui
// demande ça veut que TOUT son cours soit relu ; lui en relire quatre cinquièmes
// et se taire sur le reste est pire que de refuser.
//
// Ce qui borne la dépense, ce n'est pas un compte de documents : c'est que le
// contenu ne part **que sur demande**, et que la porte se referme après un seul
// envoi. Un plafond n'aurait rien protégé — le corpus entier tient de toute façon
// sous `MAX_CORPUS_TOKENS`, puisque la passe chapitres le reçoit en entier à
// chaque génération.

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
  const empty: ResourceOutcome = { body: null, instruction: '', dropped: false, summary: '', needs: [] };
  if (!raw || typeof raw !== 'object') return empty;

  const value = raw as Record<string, unknown>;
  const document = (value.document ?? {}) as Record<string, unknown>;

  const instruction = typeof value.instruction === 'string' ? value.instruction.trim() : '';
  const dropped = value.dropped === true;
  const summary = typeof document.summary === 'string' ? document.summary.trim().slice(0, 300) : '';

  // « write » et rien d'autre : une valeur inattendue vaut « ne touche à rien »,
  // qui est toujours la conduite la moins dommageable.
  const body = document.action === 'write' && typeof document.content === 'string'
    ? document.content.trim()
    : null;

  // Les numéros viennent du modèle : on ne garde que des entiers positifs, et on
  // dédoublonne. Pas de plafond — voir la note ci-dessus : « relis tout mon
  // cours » est une demande légitime, et la borner en silence rendrait la
  // réponse fausse sans que personne ne le sache.
  const needs = Array.isArray(value.needs)
    ? [...new Set(
        value.needs.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0),
      )]
    : [];

  return {
    body: body ? body.slice(0, MAX_GENERATED_LENGTH) : null,
    instruction,
    dropped,
    summary,
    needs,
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
