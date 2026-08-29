-- Le radar : combien de questions restent-il à poser, notion par notion et
-- niveau par niveau, pour les membres d'un atelier ?
--
-- ✅ APPLIQUÉE le 29/08/2026 (création de fonction : additive, donc sans danger
--    — le code déployé ignore ce qui n'existait pas quand il est parti).
--
-- ─── Pourquoi une fonction en base, et pas du TypeScript ─────────────────────
--
-- Le calcul croise TOUS les membres de l'atelier avec TOUTES les notions du
-- chapitre et toutes les questions qui les mobilisent. À la cible annoncée par
-- le produit — 2 000 notions et 100 000 questions par atelier — le faire côté
-- serveur applicatif voudrait dire rapatrier des centaines de milliers de
-- lignes à chaque exercice, et découper les listes d'identifiants pour ne pas
-- dépasser la longueur d'URL de PostgREST. Ici, c'est une requête ensembliste :
-- la base fait le travail, il ne remonte que le manque.
--
-- ─── Ce que « disponible » veut dire ─────────────────────────────────────────
--
-- Une question est disponible POUR UN MEMBRE si :
--   1. elle ne lui a jamais été posée (`parcours_asked`, écrit à la correction) ;
--   2. AUCUNE de ses notions ne dépasse sa portée — le niveau atteint sur cette
--      notion, plus `p_reach` (2). La règle vaut pour la grappe entière : une
--      question liée hors de portée écarte la grappe, qui se pose d'un bloc.
--      C'est ce point qui interdit de compter les questions notion par notion :
--      une question qui vise « notion 1, niveau 2 » ne compte pas pour ce couple
--      si elle mobilise par ailleurs une notion 3 au niveau 3 hors d'atteinte.
--
-- ─── Ce que la fonction rend ─────────────────────────────────────────────────
--
-- Une ligne par couple (notion du chapitre × niveau de Bloom) qui se trouve à la
-- FRONTIÈRE d'au moins un membre — c'est-à-dire les niveaux juste au-dessus de
-- ce qu'il a atteint (niveau atteint + 1 jusqu'à + p_reach, plafonnés à 4). Les
-- niveaux déjà acquis ne sont pas comptés : leur stock n'intéresse personne.
--
--   available_min : le stock du membre le PLUS démuni sur ce couple. C'est lui
--                   qui décide, parce qu'une question créée pour lui sert aussi
--                   à tous les autres — jamais l'inverse.
--   members       : combien de membres ont ce couple à leur frontière.
--
-- Le seuil de déclenchement et la cible de rechargement ne sont PAS ici : ce
-- sont des règles produit, elles vivent dans `src/lib/workshops/parcoursRadar.ts`.
-- La fonction mesure, elle ne décide pas.

create or replace function public.parcours_radar(
  p_workshop uuid,
  p_chapter uuid,
  p_reach int default 2
)
returns table (brick_id uuid, bloom_level int, available_min int, members int)
language sql
stable
set search_path = public
as $$
  with membres as (
    select wm.user_id from workshop_members wm where wm.workshop_id = p_workshop
  ),
  -- table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  notions_chapitre as (
    select b.id from workshop_bricks b
    where b.workshop_id = p_workshop and b.chapter_id = p_chapter
  ),
  -- Tous les couples (grappe, notion, niveau) du parcours de cet atelier. Un
  -- NULL de niveau se lit comme « mémoriser », exactement comme côté code.
  couples as (
    select i.group_id, l.brick_id, coalesce(l.bloom_level, 1) as lvl
    from exam_question_items i
    join exam_question_item_bricks l on l.item_id = i.id
    join exam_questions q on q.id = i.group_id
    where q.workshop_id = p_workshop and q.context = 'parcours'
  ),
  -- Une question n'a pas de chapitre à elle : elle hérite de celui de ses
  -- notions. Une grappe entre donc dans le chapitre dès qu'UNE de ses notions y
  -- est rangée — et ses autres notions comptent quand même pour la portée.
  grappes as (
    select distinct c.group_id
    from couples c
    where c.brick_id in (select id from notions_chapitre)
  ),
  niveaux as (
    select m.user_id, b.id as brick_id, coalesce(floor(bm.score / 10.0)::int, 0) as lvl
    from membres m
    cross join workshop_bricks b
    left join brick_mastery bm on bm.user_id = m.user_id and bm.brick_id = b.id
    where b.workshop_id = p_workshop
  ),
  disponibles as (
    select m.user_id, g.group_id
    from membres m
    cross join grappes g
    where not exists (
      select 1
      from couples c
      join niveaux n on n.user_id = m.user_id and n.brick_id = c.brick_id
      where c.group_id = g.group_id and c.lvl > n.lvl + p_reach
    )
    and not exists (
      select 1 from parcours_asked a
      where a.user_id = m.user_id and a.group_id = g.group_id
    )
  ),
  stock as (
    select d.user_id, c.brick_id, c.lvl, count(*)::int as n
    from disponibles d
    join couples c on c.group_id = d.group_id
    where c.brick_id in (select id from notions_chapitre)
    group by d.user_id, c.brick_id, c.lvl
  ),
  -- La frontière d'un membre : les niveaux qu'il lui reste à conquérir sur
  -- chaque notion du chapitre, dans la limite de sa portée et du niveau 4.
  frontiere as (
    select n.user_id, n.brick_id, s.lvl
    from niveaux n
    join notions_chapitre nc on nc.id = n.brick_id
    cross join lateral generate_series(n.lvl + 1, least(n.lvl + p_reach, 4)) as s(lvl)
  )
  select
    f.brick_id,
    f.lvl as bloom_level,
    min(coalesce(st.n, 0))::int as available_min,
    count(*)::int as members
  from frontiere f
  left join stock st
    on st.user_id = f.user_id and st.brick_id = f.brick_id and st.lvl = f.lvl
  group by f.brick_id, f.lvl
  order by 3 asc, 1, 2;
$$;

-- Index de soutien du chemin chaud. `exam_question_items(group_id)` n'existait
-- pas : une clé étrangère n'en crée pas, et c'est par là que passent toutes les
-- remontées « énoncé → grappe » du radar comme du tirage.
create index if not exists exam_question_items_group_idx
  on public.exam_question_items (group_id);

create index if not exists exam_question_item_bricks_brick_idx
  on public.exam_question_item_bricks (brick_id);

-- table encore nommée bricks en base — renommage différé, voir docs/backlog.md
create index if not exists workshop_bricks_chapter_idx
  on public.workshop_bricks (chapter_id);
