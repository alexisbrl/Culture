// Ce que chaque passe reçoit en entrée — module PUR, sans réseau ni base.
//
// Ces règles décidaient jusqu'ici du coût de l'ingestion sans être écrites nulle
// part : elles étaient dispersées entre l'orchestration (`run.ts`) et le
// fournisseur (`providers/claude.ts`), donc intestables. Les réunir ici les rend
// vérifiables sans clé API — et c'est le seul endroit où lire « qu'est-ce qui
// part au modèle, et pourquoi ».

import type { PreparedDocument } from './providers/types';

export type IngestPass = 'chapters' | 'notions' | 'questions';

/** Les documents qu'une passe reçoit.
 *
 *  **La passe questions n'en reçoit aucun** (§16.3, §16.21). Une notion est
 *  autoportante par construction — c'est la définition qu'en donne la passe 2 —
 *  et ce qui manque pour les niveaux supérieurs de Bloom n'est pas le cours mais
 *  les notions voisines du même chapitre. Renvoyer le corpus pour rédiger une
 *  question sur une phrase de 280 caractères, c'est ce qui a coûté ~20 $ pour
 *  zéro question le 22/08/2026 : à l'échelle du corpus de test, ~287 $ de
 *  lectures de cache contre ~8,50 $ sans les documents.
 *
 *  Posée en garde côté fournisseur, et pas seulement à l'appel : un appelant
 *  distrait ne doit pas pouvoir rouvrir le robinet. */
export function documentsForPass(pass: IngestPass, prepared: PreparedDocument[]): PreparedDocument[] {
  return pass === 'questions' ? [] : prepared;
}
