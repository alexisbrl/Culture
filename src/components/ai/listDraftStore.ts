'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { Question } from '@/lib/workshops/examTypes';

import type { GenerationEditing } from './settingsBoxStore';

// Ce qu'on est en train d'écrire en tête d'une liste de questions — banque
// d'examen ou questions du parcours —, GARDÉ DANS L'ONGLET (26/09/2026, demandé
// par Alexis).
//
// Une page qu'on quitte est démontée, et avec elle tout ce qu'elle tenait en
// mémoire : la question neuve à moitié écrite, la consigne de l'IA, la
// génération rouverte pour modification. Rangé ici, hors de la page, tout cela
// survit à un changement de page — comme l'encadré de génération des Paramètres
// (./settingsBoxStore) — et la page le retrouve en revenant. Pas à un
// rafraîchissement : il vide la mémoire de l'onglet.

export type ListDoor = 'exam' | 'parcours';

/** L'encadré de nouvelle question : le côté choisi, la consigne donnée à l'IA,
 *  et la question manuelle telle qu'elle est en train d'être écrite. */
export type ListCreation = {
  side: 'manual' | 'ai';
  aiPrompt: string;
  /** Le brouillon de la question manuelle, à chaque frappe. `null` tant que le
   *  côté manuel n'a rien produit. */
  question: Question | null;
};

/** Une génération retirée de la file pour modifier sa consigne : ce qu'il faut
 *  pour la renvoyer, le texte en cours de réécriture, et la place de son
 *  encadré dans la liste. */
export type ListEditing = GenerationEditing & { draft: string; index: number };

export type ListDraft = { creation: ListCreation | null; editing: ListEditing | null };

const EMPTY: ListDraft = { creation: null, editing: null };
const drafts = new Map<string, ListDraft>();
const listeners = new Set<() => void>();

const keyOf = (workshopId: string, door: ListDoor) => `${workshopId}:${door}`;

function patch(workshopId: string, door: ListDoor, change: Partial<ListDraft>) {
  const key = keyOf(workshopId, door);
  drafts.set(key, { ...(drafts.get(key) ?? EMPTY), ...change });
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useListDraft(workshopId: string | null | undefined, door: ListDoor): ListDraft {
  const get = useCallback(() => (workshopId ? drafts.get(keyOf(workshopId, door)) ?? EMPTY : EMPTY), [workshopId, door]);
  return useSyncExternalStore(subscribe, get, () => EMPTY);
}

/** Lecture ponctuelle, hors rendu (au retour sur la page, pour rouvrir la
 *  question manuelle en cours). */
export function readListDraft(workshopId: string, door: ListDoor): ListDraft {
  return drafts.get(keyOf(workshopId, door)) ?? EMPTY;
}

export function setListCreation(workshopId: string, door: ListDoor, creation: ListCreation | null): void {
  patch(workshopId, door, { creation });
}

export function setListEditing(workshopId: string, door: ListDoor, editing: ListEditing | null): void {
  patch(workshopId, door, { editing });
}
