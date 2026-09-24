import { CLOSED_ERROR } from './lock';

/** Une passe qui échoue laisse une trace CÔTÉ SERVEUR, en plus du message rendu
 *  à l'écran.
 *
 *  ⚠️ Sans elle, une panne d'ingestion ne survivait nulle part : le seul endroit
 *  où elle s'affichait était le dialogue, et un rafraîchissement de page — ou la
 *  fermeture de l'onglet — l'emportait avec lui. Constaté le 29/08/2026, sur une
 *  erreur de fin de génération qu'il a été impossible de retrouver après coup.
 *
 *  Le contexte (atelier, lot, chapitre, numéro de lot) est joint : « la passe
 *  questions a échoué » sans dire laquelle, sur quoi, ne se diagnostique pas.
 *
 *  Partagé par les server actions et les routes d'API de la génération. */
export function passFailed(pass: string, error: unknown, context: Record<string, unknown>): string {
  const detail = errorMessage(error);
  // Un lot refermé n'est pas une panne : c'est une annulation qui a fait son
  // travail, et l'appel qui retombe se refuse tout seul. Le dire, sans le crier.
  if (detail === CLOSED_ERROR) {
    console.info(`[ingest] passe ${pass} : écriture refusée, le lot a été annulé`, context);
    return detail;
  }
  console.error(`[ingest] passe ${pass} échouée :`, detail, context);
  return detail;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inattendue';
}
