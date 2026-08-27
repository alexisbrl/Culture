// Comparaison d'une réponse ÉCRITE à la réponse attendue.
//
// ─── Pourquoi une règle écrite plutôt qu'une comparaison de chaînes ──────────
//
// Une liste se corrige automatiquement — on connaît la réponse au caractère
// près. Mais un candidat qui tape « photosynthese » là où l'auteur a écrit « La
// photosynthèse » a raison, et le lui refuser ferait passer la correction
// automatique pour un piège. La normalisation ci-dessous est donc le contrat de
// tolérance, écrit à un seul endroit pour que le serveur (qui juge) et l'écran
// d'exercice (qui colore les champs) ne puissent pas en avoir deux lectures
// différentes.
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
 *  colorer chaque champ, là où un simple booléen ne dirait que « raté ». */
export function matchListEntries(given: string[], expected: string[]): (number | null)[] {
  const used = new Set<number>();
  return (given ?? []).map((entry) => {
    const hit = (expected ?? []).findIndex(
      (want, i) => !used.has(i) && sameAnswerText(entry, want),
    );
    if (hit < 0) return null;
    used.add(hit);
    return hit;
  });
}

/** Une liste est juste quand TOUTES les réponses attendues sont couvertes et
 *  qu'aucune saisie ne tombe à côté.
 *
 *  Le « aucune à côté » compte autant que le reste : sans lui, un candidat qui
 *  remplit chaque ligne d'une réponse différente finirait par tomber juste
 *  partout. Les lignes laissées VIDES, elles, ne pénalisent pas d'elles-mêmes —
 *  elles font simplement manquer une attente, ce que la première condition
 *  sanctionne déjà. */
export function isListCorrect(given: string[], expected: string[]): boolean {
  const wanted = (expected ?? []).filter((e) => e.trim().length > 0);
  if (wanted.length === 0) return false;

  const filled = (given ?? []).filter((e) => e.trim().length > 0);
  const hits = matchListEntries(filled, wanted);
  return hits.every((hit) => hit !== null) && new Set(hits).size === wanted.length;
}
