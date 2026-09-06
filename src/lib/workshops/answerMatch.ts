// Comparaison d'une réponse ÉCRITE à la réponse attendue.
//
// ─── Pourquoi une règle écrite plutôt qu'une comparaison de chaînes ──────────
//
// Une liste et une réponse rédigée se corrigent en comparant ce que le candidat
// a TAPÉ à ce que l'auteur a écrit. Mais un candidat qui tape « photosynthese »
// là où l'auteur a écrit « La photosynthèse » a raison, et le lui refuser ferait
// passer la correction automatique pour un piège. La normalisation ci-dessous
// est donc le contrat de tolérance, écrit à un seul endroit pour que le serveur
// (qui juge) et l'écran d'exercice (qui colore les champs) ne puissent pas en
// avoir deux lectures différentes.
//
// ─── À réserver à ce que le candidat A VRAIMENT ÉCRIT ───────────────────────
//
// ⚠️ **La mise en paires ne passe PAS par ici, et ne doit pas y passer.** Le
// candidat n'y écrit rien : il relie deux encadrés, et le texte qui revient au
// serveur n'est que l'identifiant de l'encadré touché — il nous revient tel que
// nous le lui avons envoyé. Tolérer la forme n'y rattraperait donc aucune faute
// de frappe (il n'y en a pas) et ne pourrait que faire accepter un encadré
// DIFFÉRENT au libellé voisin (« Rhône » et « le Rhône »). `gradeStatement`
// compare ces textes-là à l'identique.
//
// ─── Ce qu'elle ne fait pas ─────────────────────────────────────────────────
//
// Aucune approximation orthographique, aucune inclusion partielle. « eau » ne
// vaut pas « eau douce » : accepter un mot contenu dans la réponse rendrait
// juste la moitié des réponses fausses d'une liste, et le candidat croirait
// savoir. On tolère la FORME (casse, accents, ponctuation, article), jamais le
// FOND.
//
// Module pur, sans dépendance : il est importé côté serveur pour juger et côté
// client pour le rendu de la correction.

/** Articles retirés en tête de réponse. Uniquement en tête, et uniquement
 *  isolés : « des » dans « prise des otages » ne bouge pas. */
const LEADING_ARTICLES = ['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'the', 'a', 'an'];

/** Ramène une réponse écrite à sa forme comparable : minuscules, sans accent,
 *  sans ponctuation, espaces resserrés, article de tête retiré. */
export function normalizeAnswerText(value: string): string {
  const base = (value ?? '')
    .normalize('NFD')
    // Marques diacritiques (accents, cédilles) — la plage Unicode dédiée.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // L'apostrophe devient une espace : « l'eau » et « l eau » doivent se
    // rejoindre avant le retrait de l'article.
    .replace(/['’]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const [first, ...rest] = base.split(' ');
  // Un article seul reste tel quel : le retirer laisserait une réponse vide,
  // qui vaudrait alors toutes les autres réponses vides.
  return first && rest.length > 0 && LEADING_ARTICLES.includes(first) ? rest.join(' ') : base;
}

/** Deux réponses écrites disent-elles la même chose ? Une réponse vide ne vaut
 *  jamais une réponse vide : ne rien écrire n'est pas répondre. */
export function sameAnswerText(given: string, expected: string): boolean {
  const a = normalizeAnswerText(given);
  return a.length > 0 && a === normalizeAnswerText(expected);
}

/** Les réponses attendues qu'une liste de saisies couvre, par appariement UN
 *  POUR UN : une même attente n'est jamais satisfaite deux fois par la même
 *  réponse répétée.
 *
 *  Renvoie, pour chaque saisie et dans son ordre, l'index de l'attente qu'elle
 *  satisfait — ou `null`. C'est ce détail qui permet à l'écran d'exercice de
 *  colorer chaque champ, là où un simple booléen ne dirait que « raté ».
 *
 *  ⚠️ **`ordered` change la question posée.** Sans lui, on demande « cette
 *  réponse figure-t-elle quelque part parmi les attentes ? » ; avec lui, « la
 *  ligne 3 porte-t-elle la 3ᵉ réponse attendue ? ». Une liste numérotée étant
 *  toujours exhaustive (voir `listAnswerCount`), les positions ont un sens des
 *  deux côtés : la ligne N fait face à l'attente N, sans appariement à
 *  chercher. Une ligne laissée vide ne décale donc rien — elle rate sa propre
 *  attente, et elle seule. */
export function matchListEntries(
  given: string[],
  expected: string[],
  options?: { ordered?: boolean },
): (number | null)[] {
  const want = expected ?? [];
  if (options?.ordered) {
    return (given ?? []).map((entry, row) => (sameAnswerText(entry, want[row] ?? '') ? row : null));
  }
  const used = new Set<number>();
  return (given ?? []).map((entry) => {
    const hit = want.findIndex((w, i) => !used.has(i) && sameAnswerText(entry, w));
    if (hit < 0) return null;
    used.add(hit);
    return hit;
  });
}

/** Une liste est juste quand le candidat donne le nombre de bonnes réponses
 *  qu'on lui demande (`required`, voir `listAnswerCount`) et qu'aucune de ses
 *  saisies ne tombe à côté.
 *
 *  Le « aucune à côté » compte autant que le reste : sans lui, un candidat qui
 *  remplit chaque ligne d'une réponse différente finirait par tomber juste
 *  partout. Les lignes laissées VIDES, elles, ne pénalisent pas d'elles-mêmes —
 *  elles font simplement manquer une réponse, ce que le compte sanctionne déjà.
 *
 *  ⚠️ **`required` n'est pas toujours le nombre de réponses acceptées.** Une
 *  question peut en accepter huit et n'en réclamer que trois (« cite trois
 *  fleuves ») : exiger les huit rendait la question impossible à réussir, alors
 *  que l'écran ne proposait que trois lignes — c'était le cas du 01 au
 *  06/09/2026.
 *
 *  ⚠️ **`ordered` compare LIGNE À LIGNE**, la ligne N face à la Nᵉ réponse
 *  attendue : c'est le sens du réglage « numéros » de l'éditeur (l'auteur écrit
 *  ses réponses dans l'ordre attendu, et l'IA reçoit la même consigne). Le
 *  verdict reste tout-ou-rien comme partout ailleurs — une liste juste mais
 *  décalée d'un cran est fausse, et les champs colorés à l'écran montrent
 *  exactement où le décalage commence. */
export function isListCorrect(
  given: string[],
  expected: string[],
  options?: { required?: number; ordered?: boolean },
): boolean {
  const wanted = (expected ?? []).filter((e) => e.trim().length > 0);
  if (wanted.length === 0) return false;
  const required = Math.min(Math.max(options?.required ?? wanted.length, 1), wanted.length);

  if (options?.ordered) {
    // Pas de filtrage des lignes vides : leur position fait partie de la
    // réponse. Au-delà de ce qui est demandé, en revanche, il ne doit rien y
    // avoir — une réponse de trop reste une réponse à côté.
    const rows = Math.max(required, (given ?? []).length);
    for (let row = 0; row < rows; row += 1) {
      const entry = (given ?? [])[row] ?? '';
      if (row < required) {
        if (!sameAnswerText(entry, wanted[row] ?? '')) return false;
      } else if (entry.trim().length > 0) {
        return false;
      }
    }
    return true;
  }

  const filled = (given ?? []).filter((e) => e.trim().length > 0);
  const hits = matchListEntries(filled, wanted);
  return hits.every((hit) => hit !== null) && new Set(hits).size === required;
}
