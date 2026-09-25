'use client';

import { useCallback, useSyncExternalStore } from 'react';

// L'encadré de génération des Paramètres, PARTAGÉ par Ressources et Chapitre &
// Notion (25/09/2026, demandé par Alexis).
//
// Les deux onglets ont le même bouton : ils ont donc le même encadré. L'ouvrir
// d'un côté l'ouvre de l'autre, et passer d'un onglet à l'autre ne perd ni
// l'encadré, ni la consigne en cours d'écriture, ni la génération en attente
// qu'on modifie. D'où un état hors des deux sections, qui ne font que l'afficher.

/** Une génération retirée de la file pour modifier sa consigne : son texte, et
 *  son rang d'origine, que le renvoi lui rend (@/lib/ingest/queue). */
export type GenerationEditing = { prompt: string; rankAt: string };

export type SettingsBox = {
  editing?: GenerationEditing;
  /** La consigne telle qu'elle est en train d'être écrite. */
  prompt: string;
  /** L'instant d'ouverture : l'encadré ne se déploie qu'à ce moment-là, pas à
   *  chaque retour sur l'onglet (une section masquée qu'on réaffiche rejouerait
   *  son animation). */
  openedAt: number;
};

const boxes = new Map<string, SettingsBox | null>();
const listeners = new Set<() => void>();

function set(workshopId: string, box: SettingsBox | null) {
  boxes.set(workshopId, box);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSettingsBox(workshopId: string): SettingsBox | null {
  const get = useCallback(() => boxes.get(workshopId) ?? null, [workshopId]);
  return useSyncExternalStore(subscribe, get, () => null);
}

/** Ouvre l'encadré — vierge, ou sur une génération en attente à modifier. Déjà
 *  ouvert sur la même chose, il reste tel quel, consigne comprise. */
export function openSettingsBox(workshopId: string, editing?: GenerationEditing): void {
  const current = boxes.get(workshopId);
  if (current && current.editing?.rankAt === editing?.rankAt) return;
  set(workshopId, { editing, prompt: editing?.prompt ?? '', openedAt: Date.now() });
}

export function closeSettingsBox(workshopId: string): void {
  set(workshopId, null);
}

export function setSettingsBoxPrompt(workshopId: string, prompt: string): void {
  const current = boxes.get(workshopId);
  if (current) set(workshopId, { ...current, prompt });
}
