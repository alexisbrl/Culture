'use client';

// Historique des actions des paramètres d'atelier, pour le bouton d'annulation.
//
// Chaque geste s'enregistre immédiatement ; celui qui le fait inscrit ici de
// quoi le défaire. Le bouton (et Ctrl+Z) défait toujours le DERNIER, un par
// un — sauter au milieu de la liste créerait des incohérences (restaurer une
// notion dans un chapitre supprimé depuis). La liste n'est jamais affichée.
//
// Elle vit le temps de la page : la quitter la vide, et efface au passage les
// copies de suppression qu'elle seule pouvait restaurer (voir
// @/lib/workshops/trash ; les copies de plus d'un jour sont purgées de toute
// façon, si la page se ferme sans prévenir).

import { createContext, useContext } from 'react';
import type { NavSection } from './sections';

export type UndoEntry = {
  /** Section où l'action a eu lieu : on y retourne pour montrer ce qu'on défait. */
  section: NavSection;
  /** Copie de suppression que cette action peut restaurer (voir
   *  @/lib/workshops/trash) : quitter la page l'efface, puisque la liste
   *  disparaît avec elle. */
  trashId?: string;
  /** Défait l'action ; `false` si c'est impossible (la page affiche alors un
   *  message, et l'entrée est abandonnée). */
  undo: () => Promise<boolean>;
};

export const UndoHistoryContext = createContext<(entry: UndoEntry) => void>(() => {});

/** Inscrit une action dans l'historique. */
export function useRecordUndo() {
  return useContext(UndoHistoryContext);
}

// ─── L'annulation de la dernière génération ─────────────────────────────────
//
// Elle n'est pas une entrée de la pile : elle ne vient d'aucun geste de la page,
// elle peut être là dès l'arrivée, et elle disparaît à la première modification
// de Chapitre & Notion (@/lib/workshops/generationUndo). La section des notions,
// qui la tient, la signale à la page, qui affiche son bouton au-dessus du bouton
// « annuler » et demande confirmation avant qu'une annulation ordinaire ne
// touche au programme.

export type GenerationUndoHandle = {
  /** Chapitres et notions créés, et éléments déplacés ou écartés. */
  created: number;
  changed: number;
  /** Annule la génération ; `false` si elle ne s'annule plus. */
  run: () => Promise<boolean>;
  /** Renonce à l'annulation : on s'apprête à modifier le programme. */
  dismiss: () => void;
};

export const GenerationUndoContext = createContext<(handle: GenerationUndoHandle | null) => void>(() => {});

export function useReportGenerationUndo() {
  return useContext(GenerationUndoContext);
}
