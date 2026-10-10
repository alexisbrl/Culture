// Les chapitres posés par le site, sans IA, à partir des parties du document de
// l'IA — 08/10/2026.
//
// Le document de l'IA s'écrit partie par partie, chaque partie sous un titre de
// niveau 2, et chaque partie est exactement une page (§7.3, `textPages`). Quand
// c'est le SEUL document d'une génération, son découpage est donc déjà connu :
// le demander au modèle coûtait un appel sur tout le cours pour recopier des
// titres. Le site le lit lui-même.
//
// Les règles, décidées avec Alexis :
// • une partie = un chapitre, dans l'ordre du document ;
// • un chapitre existant dont le titre est celui d'une partie est GARDÉ tel
//   quel, avec ses notions ; les autres sortent du programme (§7.6 : le
//   programme est le découpage du cours actuel, et rien d'autre) ;
// • sans notion existante, rien à juger : on passe directement aux notions ;
//   avec, un seul appel ne rend que les verdicts, chapitres figés.
//
// **Fonction pure**, testée : c'est elle qui décide quels chapitres sortent.

/** Les chapitres classés (rang > 0) dans l'ordre du programme. **Deux rangs
 *  égaux se départagent par la place des chapitres dans le cours** (décision
 *  d'Alexis du 08/10/2026) : le format de réponse ne sait pas interdire un rang
 *  en double, et l'ordre d'écriture de la réponse était arbitraire. **Pure.** */
export function rankedByCourse<T extends { ref: string; rank: number }>(
  order: readonly T[],
  coursePosition: (ref: string) => number,
): T[] {
  return order
    .filter((c) => c.rank > 0)
    .map((c) => ({ c, at: coursePosition(c.ref) }))
    .sort((a, b) => a.c.rank - b.c.rank || a.at - b.at)
    .map(({ c }) => c);
}

/** La place d'un chapitre dans le cours : son premier document dans l'ordre du
 *  lot, puis sa première page. Sans borne, il passe après les autres. **Pure.** */
export function coursePositions(
  bounds: readonly { ref: string; spans: readonly { document: string; from: number }[] }[],
  documentOrder: readonly string[],
): (ref: string) => number {
  const at = new Map(bounds.map((b) => [
    b.ref,
    Math.min(...b.spans.map((s) => {
      const index = documentOrder.indexOf(s.document);
      return (index < 0 ? documentOrder.length : index) * 1_000_000 + s.from;
    }), Number.MAX_SAFE_INTEGER),
  ]));
  return (ref) => at.get(ref) ?? Number.MAX_SAFE_INTEGER;
}

/** Un document dont les pages ne sont pas des parties titrées ne se découpe
 *  pas ici : l'étape chapitres ordinaire s'en charge. */
const PART_HEADING = /^##\s+(.+?)\s*$/m;

function sameTitle(a: string): string {
  return a.replace(/\s+/g, ' ').trim();
}

export type PartsProgram = {
  fresh: { ref: string; name: string }[];
  chapterOrder: { ref: string; rank: number; reason: string }[];
  chapterBounds: { ref: string; spans: { document: string; from: number; to: number }[] }[];
  /** Les chapitres existants qui sortent : aucune partie ne porte leur titre. */
  dropped: string[];
  /** Le nombre de chapitres existants gardés. */
  kept: number;
};

/** Le programme tiré des pages du document de l'IA, ou `null` s'il n'a pas de
 *  parties titrées. `pages` : ses pages telles que `textPages` les coupe — la
 *  première est l'en-tête posé par le code, qui n'est pas une partie. */
export function partsProgram(
  documentId: string,
  pages: readonly string[],
  existing: readonly { id: string; name: string }[],
): PartsProgram | null {
  const parts = pages.flatMap((page, index) => {
    if (!page.startsWith('## ')) return [];
    const title = sameTitle(PART_HEADING.exec(page)?.[1] ?? '');
    return title ? [{ page: index + 1, title }] : [];
  });
  if (parts.length === 0) return null;

  const unmatched = [...existing];
  const fresh: PartsProgram['fresh'] = [];
  const chapterOrder: PartsProgram['chapterOrder'] = [];
  const chapterBounds: PartsProgram['chapterBounds'] = [];
  let kept = 0;

  parts.forEach((part, index) => {
    const match = unmatched.findIndex((c) => sameTitle(c.name) === part.title);
    let ref: string;
    if (match >= 0) {
      ref = unmatched[match].id;
      unmatched.splice(match, 1);
      kept += 1;
    } else {
      ref = `partie-${index + 1}`;
      fresh.push({ ref, name: part.title });
    }
    chapterOrder.push({ ref, rank: index + 1, reason: '' });
    chapterBounds.push({ ref, spans: [{ document: documentId, from: part.page, to: part.page }] });
  });

  for (const chapter of unmatched) {
    chapterOrder.push({ ref: chapter.id, rank: 0, reason: "aucune partie du document de l'IA ne porte ce titre" });
  }

  return { fresh, chapterOrder, chapterBounds, dropped: unmatched.map((c) => c.id), kept };
}
