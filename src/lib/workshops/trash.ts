// Copie des suppressions des paramètres d'atelier (05/10/2026).
//
// Les paramètres enregistrent chaque geste immédiatement et offrent un bouton
// « annuler » (docs/architecture.md §11.5). Une suppression efface donc tout de
// suite — la notion ou le chapitre disparaît pour tout le monde, parcours et
// génération compris, sans qu'aucune lecture de l'app ait à filtrer quoi que ce
// soit — mais elle met d'abord de côté de quoi tout remettre à l'identique :
// les lignes elles-mêmes et ce que la suppression emporte en cascade.
//
// Une copie est un LOT : une notion, un chapitre, un chapitre écarté avec ses
// notions, ou d'un coup toutes les notions sans chapitre.
// Un seul « annuler » le remet entier.
//
// Opération destructrice par lot et restauration d'identifiants : c'est le cas
// que CLAUDE.md §7 veut couvert par un test (`tests/unit/trash.test.ts`). Le
// client est donc reçu en paramètre.
//
// ⚠️ La copie vit côté serveur, jamais dans le navigateur : restaurer n'écrit
// que ce que le serveur a lui-même mis de côté. Le navigateur ne détient qu'un
// identifiant de copie, borné à l'atelier.

import type { getSupabaseServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';

type Client = ReturnType<typeof getSupabaseServerClient>;

/** Au-delà, la copie ne sert plus : la page qui pouvait l'annuler est fermée
 *  depuis longtemps. Purgée à chaque nouvelle suppression. */
const TRASH_TTL_MS = 24 * 60 * 60 * 1000;

/** Les filtres « parmi ces identifiants » passent dans l'adresse de la
 *  requête : au-delà de quelques centaines, elle devient trop longue. */
const CHUNK = 100;

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

type Row = Record<string, unknown> & { id: string };
type NotionRow = Row & { workshop_id: string; chapter_id: string | null };
type ChapterRow = Row & { workshop_id: string };

/** Ce qu'une copie met de côté. `reattach` : les notions d'un chapitre
 *  supprimé SANS elles (elles sont restées, sans chapitre) — à y remettre. */
type Bundle = {
  chapters: ChapterRow[];
  notions: NotionRow[];
  mastery: Record<string, unknown>[];
  links: (Record<string, unknown> & { item_id: string })[];
  reattach: { chapterId: string; notionIds: string[] }[];
};

export type Restored = {
  chapterIds: string[];
  notionIds: string[];
};

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/** Lit par morceaux ; `null` si un morceau échoue — une copie incomplète ferait
 *  perdre en silence ce que l'annulation promet de rendre. */
async function selectIn<T>(
  ids: readonly string[],
  read: (part: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const out: T[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await read(part);
    if (error) return null;
    out.push(...(data ?? []));
  }
  return out;
}

async function purgeExpired(supabase: Client) {
  const limit = new Date(Date.now() - TRASH_TTL_MS).toISOString();
  // Une purge ratée ne bloque rien : elle sera refaite à la suppression suivante.
  await supabase.from('settings_trash').delete().lt('created_at', limit);
}

/** Met le lot de côté PUIS supprime — les notions d'abord, les chapitres
 *  ensuite, chacune bornée à l'atelier et aux identifiants mis de côté (jamais
 *  par un filtre plus large : une notion arrivée entre-temps n'est pas dans la
 *  copie). Si la copie échoue, rien n'est effacé ; si l'effacement échoue en
 *  route, la copie reste et peut tout remettre. */
async function stashAndDelete(
  supabase: Client,
  workshopId: string,
  notions: NotionRow[],
  chapters: ChapterRow[],
  reattach: Bundle['reattach'],
): Promise<Result<{ trashId: string }>> {
  const notionIds = notions.map((n) => n.id);
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const mastery = await selectIn(notionIds, (part) => supabase.from('brick_mastery').select('*').in('brick_id', part));
  const links = await selectIn(notionIds, (part) => supabase.from('exam_question_item_bricks').select('*').in('brick_id', part));
  if (!mastery || !links) return { success: false, error: 'Erreur lors de la suppression' };

  await purgeExpired(supabase);

  const bundle: Bundle = { chapters, notions, mastery, links, reattach };
  const { data: stash, error: stashError } = await supabase
    .from('settings_trash')
    .insert({ workshop_id: workshopId, kind: 'bundle', payload: bundle as unknown as Json })
    .select('id')
    .single();
  if (stashError || !stash) return { success: false, error: 'Erreur lors de la suppression' };

  for (const part of chunks(notionIds)) {
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    const { error } = await supabase.from('workshop_bricks').delete().eq('workshop_id', workshopId).in('id', part);
    if (error) return { success: false, error: 'Erreur lors de la suppression' };
  }
  const chapterIds = chapters.map((c) => c.id);
  for (const part of chunks(chapterIds)) {
    const { error } = await supabase.from('workshop_chapters').delete().eq('workshop_id', workshopId).in('id', part);
    if (error) return { success: false, error: 'Erreur lors de la suppression' };
  }
  return { success: true, trashId: stash.id };
}

/** Supprime une notion, avec la progression des élèves et ses liens aux
 *  questions, que la base efface en cascade. */
export async function trashNotion(supabase: Client, workshopId: string, notionId: string): Promise<Result<{ trashId: string }>> {
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notion } = await supabase
    .from('workshop_bricks').select('*').eq('id', notionId).eq('workshop_id', workshopId).maybeSingle();
  if (!notion) return { success: false, error: 'Notion introuvable' };
  return stashAndDelete(supabase, workshopId, [notion as NotionRow], [], []);
}

/** Supprime un chapitre. Ses notions restent (elles retombent dans « sans
 *  chapitre ») : la copie retient lesquelles, pour les y remettre. */
export async function trashChapter(supabase: Client, workshopId: string, chapterId: string): Promise<Result<{ trashId: string }>> {
  const { data: chapter } = await supabase
    .from('workshop_chapters').select('*').eq('id', chapterId).eq('workshop_id', workshopId).maybeSingle();
  if (!chapter) return { success: false, error: 'Chapitre introuvable' };

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notions, error } = await supabase
    .from('workshop_bricks').select('id').eq('workshop_id', workshopId).eq('chapter_id', chapterId);
  if (error) return { success: false, error: 'Erreur lors de la suppression' };

  return stashAndDelete(supabase, workshopId, [], [chapter as ChapterRow], [
    { chapterId, notionIds: (notions ?? []).map((n) => n.id) },
  ]);
}

/** Supprime un chapitre écarté par l'IA AVEC ses notions — elles sont déjà
 *  hors du programme ; sans cela, elles tomberaient dans « sans chapitre ». */
export async function trashHiddenChapter(supabase: Client, workshopId: string, chapterId: string): Promise<Result<{ trashId: string }>> {
  const { data: chapter } = await supabase
    .from('workshop_chapters').select('*').eq('id', chapterId).eq('workshop_id', workshopId).eq('hidden', true).maybeSingle();
  if (!chapter) return { success: false, error: 'Chapitre introuvable' };

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notions, error } = await supabase
    .from('workshop_bricks').select('*').eq('workshop_id', workshopId).eq('chapter_id', chapterId);
  if (error) return { success: false, error: 'Erreur lors de la suppression' };

  return stashAndDelete(supabase, workshopId, (notions ?? []) as NotionRow[], [chapter as ChapterRow], []);
}

/** Supprime toutes les notions sans chapitre. */
export async function trashUnassignedNotions(supabase: Client, workshopId: string): Promise<Result<{ trashId: string }>> {
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notions, error } = await supabase
    .from('workshop_bricks').select('*').eq('workshop_id', workshopId).is('chapter_id', null);
  if (error) return { success: false, error: 'Erreur lors de la suppression' };
  if (!notions || notions.length === 0) return { success: false, error: 'Aucune notion à supprimer' };

  return stashAndDelete(supabase, workshopId, notions as NotionRow[], [], []);
}

/** Remet à l'identique ce qu'une copie a mis de côté, puis retire la copie.
 *  La copie est cherchée DANS l'atelier : un identifiant venu du navigateur ne
 *  peut pas restaurer chez un autre. */
export async function restoreFromTrash(supabase: Client, workshopId: string, trashId: string): Promise<Result<{ restored: Restored }>> {
  const { data: stash } = await supabase
    .from('settings_trash')
    .select('id, kind, payload')
    .eq('id', trashId)
    .eq('workshop_id', workshopId)
    .maybeSingle();
  if (!stash || stash.kind !== 'bundle') return { success: false, error: 'Plus rien à restaurer' };

  const { chapters, notions, mastery, links, reattach } = stash.payload as unknown as Bundle;
  // Le contenu a été écrit par le serveur, mais on ne réécrit jamais une ligne
  // dans un autre atelier que celui de la demande.
  if ([...chapters, ...notions].some((row) => row.workshop_id !== workshopId)) {
    return { success: false, error: 'Plus rien à restaurer' };
  }

  if (chapters.length > 0) {
    const { error } = await supabase.from('workshop_chapters').insert(chapters as never);
    if (error) return { success: false, error: 'Erreur lors de la restauration' };
  }

  if (notions.length > 0) {
    // Le chapitre d'une notion a pu disparaître depuis : elle revient alors
    // dans « sans chapitre » plutôt que de ne pas revenir du tout.
    const wanted = [...new Set(notions.map((n) => n.chapter_id).filter((id): id is string => !!id))];
    const existing = await selectIn(wanted, (part) =>
      supabase.from('workshop_chapters').select('id').eq('workshop_id', workshopId).in('id', part));
    const alive = new Set((existing ?? []).map((c) => c.id));
    const rows = notions.map((n) => ({ ...n, chapter_id: n.chapter_id && alive.has(n.chapter_id) ? n.chapter_id : null }));

    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    const { error } = await supabase.from('workshop_bricks').insert(rows as never);
    if (error) return { success: false, error: 'Erreur lors de la restauration' };

    if (mastery.length > 0) await supabase.from('brick_mastery').insert(mastery as never);
    // Seulement les liens vers des questions qui existent encore.
    const itemIds = [...new Set(links.map((l) => l.item_id))];
    const items = await selectIn(itemIds, (part) => supabase.from('exam_question_items').select('id').in('id', part));
    const liveItems = new Set((items ?? []).map((i) => i.id));
    const kept = links.filter((l) => liveItems.has(l.item_id));
    if (kept.length > 0) await supabase.from('exam_question_item_bricks').insert(kept as never);
  }

  // Ne reprend que les notions restées sans chapitre : une notion rangée
  // ailleurs depuis garde la place qu'on lui a donnée.
  for (const { chapterId, notionIds } of reattach) {
    for (const part of chunks(notionIds)) {
      // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
      await supabase
        .from('workshop_bricks')
        .update({ chapter_id: chapterId })
        .eq('workshop_id', workshopId)
        .in('id', part)
        .is('chapter_id', null);
    }
  }

  await supabase.from('settings_trash').delete().eq('id', stash.id);
  return {
    success: true,
    restored: { chapterIds: chapters.map((c) => c.id), notionIds: notions.map((n) => n.id) },
  };
}

/** Efface des copies devenues inutiles : la page qui pouvait les annuler a été
 *  quittée, et quitter la page vide la liste des actions. Bornée à l'atelier :
 *  des identifiants venus du navigateur ne touchent pas aux copies d'un autre.
 *  Ce n'est qu'un ménage — la purge des copies de plus d'un jour reste le filet
 *  de sécurité quand la page se ferme sans prévenir. */
export async function discardTrash(supabase: Client, workshopId: string, trashIds: readonly string[]): Promise<void> {
  const ids = [...new Set(trashIds.filter((id) => typeof id === 'string' && id.length > 0))];
  for (const part of chunks(ids)) {
    await supabase.from('settings_trash').delete().eq('workshop_id', workshopId).in('id', part);
  }
}
