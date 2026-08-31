-- Le tirage d'une question passe côté base, et le radar se met à la hauteur
-- d'un membre.
--
-- ✅ APPLIQUÉE le 29/08/2026 (fonctions : additif, sans danger — le code déployé
--    ignore ce qui n'existait pas quand il est parti ; `parcours_radar` gagne un
--    paramètre facultatif, ses appels existants restent valides).
--
-- ─── Pourquoi le tirage descend ici ──────────────────────────────────────────
--
-- L'application chargeait tous les énoncés et toutes les notions du chapitre à
-- chaque question tirée, puis filtrait en TypeScript. Tenable à quelques
-- dizaines de questions, intenable à la cible du produit — 2 000 notions et
-- 100 000 questions par atelier, soit des milliers de grappes par chapitre :
-- la liste d'identifiants voyageait en clair dans l'URL de PostgREST, et la
-- fonction serveur portait tout le chapitre en mémoire pour n'en garder qu'une
-- question.
--
-- ⚠️ POUR `parcours_pick`, CE FICHIER EST PÉRIMÉ depuis le 30/08/2026 : la
--    définition qui fait foi est `2026-08-30-tirage-sans-repeter-la-notion.sql`
--    (elle ajoute la préférence « pas deux fois la même notion dans un même
--    exercice »). Ce qui suit reste exact pour `parcours_radar`, inchangée, et
--    pour l'énoncé des règles 1 à 5 — le fichier du 30/08 n'en modifie aucune,
--    il n'ajoute qu'un critère de tri en tête.
--
-- ⚠️ CE FICHIER EST DÉSORMAIS LA SEULE DÉFINITION DES RÈGLES DE TIRAGE. Elles
-- vivaient en double (module TypeScript testé + cette requête) ; deux copies
-- d'une même règle finissent toujours par diverger, et c'est celle qui tourne
-- qui gagne. Le module a donc été retiré. Les règles, dans l'ordre où la
-- requête les applique :
--
--   1. **Le chapitre.** Une question n'a pas de chapitre à elle : elle hérite de
--      celui de ses notions. Une grappe entre dans le chapitre dès qu'UNE de ses
--      notions y est rangée — et ses autres notions comptent quand même pour le
--      reste des règles.
--   2. **La portée.** Aucune notion de la grappe ne doit dépasser le niveau
--      atteint par le membre sur CETTE notion, plus `p_reach` (2). Une seule
--      notion hors de portée écarte la grappe entière, qui se pose d'un bloc.
--   3. **L'inédit.** Jamais répondue par ce membre (`parcours_asked`, écrit à la
--      correction), et pas déjà posée dans l'exercice en cours (`p_exclude`).
--   4. **Le budget.** Un énoncé coûte le plus haut niveau qu'il demande (1 s'il
--      ne demande aucune notion) ; une grappe coûte la somme de ses énoncés. Ce
--      coût doit tenir dans ce qui reste des 12 niveaux de l'exercice.
--   5. **La priorité.** La notion la moins maîtrisée d'abord ; au hasard entre
--      les grappes à égalité, sans quoi le même enchaînement reviendrait à
--      chaque exercice.
--
-- `eligible_total` et `chapter_total` remontent avec le résultat pour que
-- l'appelant distingue trois impasses sans second aller-retour : chapitre vide
-- (aucune question), stock épuisé (rien d'inédit à portée — anomalie que la
-- recharge doit empêcher), et fin normale d'exercice (il reste des questions,
-- mais plus assez de budget pour la moins chère).

create or replace function public.parcours_pick(
  p_workshop uuid,
  p_chapter uuid,
  p_user text,
  p_remaining int,
  p_reach int default 2,
  p_exclude text[] default '{}'
)
returns table (group_id text, cost int, eligible_total int, chapter_total int)
language sql
-- Volontairement VOLATILE : le départage se fait par `random()`.
as $$
  -- table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  with notions_chapitre as (
    select b.id from workshop_bricks b
    where b.workshop_id = p_workshop and b.chapter_id = p_chapter
  ),
  -- Un énoncé sans notion produit ici une ligne à `brick_id` nul et au niveau 1 :
  -- il ne restreint la portée d'aucune notion, mais il coûte quand même — il
  -- occupe le membre, il ne peut pas être gratuit.
  couples as (
    select i.group_id, i.id as item_id, l.brick_id, coalesce(l.bloom_level, 1) as lvl
    from exam_question_items i
    join exam_questions q on q.id = i.group_id
    left join exam_question_item_bricks l on l.item_id = i.id
    where q.workshop_id = p_workshop and q.context = 'parcours'
  ),
  grappes as (
    select distinct c.group_id from couples c
    where c.brick_id in (select id from notions_chapitre)
  ),
  niveaux as (
    select b.id as brick_id, coalesce(floor(bm.score / 10.0)::int, 0) as lvl
    from workshop_bricks b
    left join brick_mastery bm on bm.brick_id = b.id and bm.user_id = p_user
    where b.workshop_id = p_workshop
  ),
  cout_enonce as (
    select c.group_id, c.item_id, max(c.lvl) as mx
    from couples c group by c.group_id, c.item_id
  ),
  cout as (
    select group_id, sum(mx)::int as cost from cout_enonce group by group_id
  ),
  -- Score de la notion la moins maîtrisée de la grappe : c'est lui qui donne la
  -- priorité. Une grappe sans aucune notion passe en dernier (40 = maîtrise
  -- maximale) : elle ne fait progresser personne.
  faiblesse as (
    select c.group_id, min(coalesce(bm.score, 0))::int as weakest
    from couples c
    left join brick_mastery bm on bm.brick_id = c.brick_id and bm.user_id = p_user
    where c.brick_id is not null
    group by c.group_id
  ),
  eligibles as (
    select g.group_id, k.cost, coalesce(f.weakest, 40) as weakest
    from grappes g
    join cout k on k.group_id = g.group_id
    left join faiblesse f on f.group_id = g.group_id
    where not exists (
      select 1 from couples c
      join niveaux n on n.brick_id = c.brick_id
      where c.group_id = g.group_id and c.lvl > n.lvl + p_reach
    )
    and not exists (
      select 1 from parcours_asked a
      where a.user_id = p_user and a.group_id = g.group_id
    )
    and not (g.group_id = any(p_exclude))
  )
  select
    e.group_id,
    e.cost,
    (select count(*)::int from eligibles),
    (select count(*)::int from grappes)
  from (select 1) as toujours_une_ligne
  left join lateral (
    select el.group_id, el.cost
    from eligibles el
    where el.cost <= p_remaining
    order by el.weakest asc, random()
    limit 1
  ) e on true;
$$;

-- ─── Le radar se met à la hauteur d'UN membre ────────────────────────────────
--
-- Il tourne au lancement d'un exercice, et c'est le manque du membre qui lance
-- qu'il faut combler : mesurer le plus démuni de l'atelier ne débloquerait pas
-- celui qui a la page ouverte. `p_user` nul conserve l'ancien comportement — le
-- membre le plus démuni, tous membres confondus —, pour un balayage périodique
-- de tout un atelier le jour où il existera.
create or replace function public.parcours_radar(
  p_workshop uuid,
  p_chapter uuid,
  p_reach int default 2,
  p_user text default null
)
returns table (brick_id uuid, bloom_level int, available_min int, members int)
language sql
stable
set search_path = public
as $$
  with membres as (
    select wm.user_id from workshop_members wm
    where wm.workshop_id = p_workshop
      and (p_user is null or wm.user_id = p_user)
  ),
  notions_chapitre as (
    select b.id from workshop_bricks b
    where b.workshop_id = p_workshop and b.chapter_id = p_chapter
  ),
  couples as (
    select i.group_id, l.brick_id, coalesce(l.bloom_level, 1) as lvl
    from exam_question_items i
    join exam_question_item_bricks l on l.item_id = i.id
    join exam_questions q on q.id = i.group_id
    where q.workshop_id = p_workshop and q.context = 'parcours'
  ),
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
