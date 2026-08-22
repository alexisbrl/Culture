// Rendre les documents au fournisseur.
//
// ─── Pourquoi ça existe ──────────────────────────────────────────────────────
//
// **Les fichiers de la Files API ne s'effacent jamais tout seuls.** Ils
// persistent sous le compte jusqu'à suppression explicite, et un nouveau
// téléversement n'efface pas les anciens (§16.8). Jusqu'ici, `providers/claude.ts`
// n'appelait que `files.upload` : chaque ingestion, chaque nouvel essai, chaque
// import annulé laissait ses PDF chez le fournisseur, indéfiniment. Deux
// conséquences — du stockage qui s'accumule, et un écart avec ce qu'on pourrait
// affirmer à un utilisateur sur la durée de conservation de ses documents.
//
// ─── Pourquoi ça n'échoue jamais ─────────────────────────────────────────────
//
// Un ménage raté ne doit **jamais** faire échouer ce qu'il accompagne. À
// l'annulation, l'utilisateur veut que son import disparaisse de l'atelier : lui
// renvoyer une erreur parce qu'un fichier distant n'a pas pu être effacé serait
// absurde — et le lot, lui, aurait bel et bien été retiré.

import type { PlanProvider, PreparedDocument } from './providers/types';

/** Supprime les documents chez le fournisseur. **Ne lève jamais.** Renvoie
 *  `true` si la suppression a abouti, `false` si elle a échoué — l'appelant
 *  peut le journaliser, il ne doit pas s'en servir pour interrompre quoi que
 *  ce soit. Ces opérations sont gratuites (§16.22). */
export async function releaseDocuments(
  provider: Pick<PlanProvider, 'release'>,
  documents: PreparedDocument[],
): Promise<boolean> {
  if (documents.length === 0) return true;
  try {
    await provider.release(documents);
    return true;
  } catch (error) {
    console.warn(
      '[ingest] suppression des fichiers du fournisseur impossible :',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
