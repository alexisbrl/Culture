// Le programme est verrouillé pendant qu'une génération le construit — 08/10/2026.
//
// Une génération lancée depuis les Paramètres écrit des chapitres et des
// notions pendant plusieurs minutes. Les modifier en même temps à la main
// casse son travail en silence : un chapitre supprimé avant que ses notions
// n'arrivent fait refuser ces notions (déjà payées), un déplacement est défait
// par le rangement de fin, et l'annulation de la génération ne sait plus
// distinguer ce qu'elle a fait de ce que l'utilisateur a fait.
//
// Donc, tant qu'une telle génération tourne, **toute modification des
// chapitres et des notions est refusée** — côté serveur ici, et l'écran éteint
// ses gestes en le disant. Les générations de QUESTIONS ne verrouillent rien :
// elles ne touchent ni aux chapitres ni aux notions, et une notion supprimée
// pendant qu'on lui écrit des questions est sans conséquence (`insertGroups`).

import { liveImportFrom } from '@/lib/ingest/lock';

import { PROGRAM_ORIGINS } from './generationUndo';

export { PROGRAM_LOCKED } from './programLockError';

/** Vrai si une génération du programme tourne sur l'atelier. */
export function programLocked(workshopId: string): Promise<boolean> {
  return liveImportFrom(workshopId, PROGRAM_ORIGINS);
}
