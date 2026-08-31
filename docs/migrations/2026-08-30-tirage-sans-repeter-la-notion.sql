-- Un exercice ne repose pas la même notion tant qu'une autre attend son tour.
--
-- ✅ APPLIQUÉE le 30/08/2026. Rien à déployer d'abord : voir l'avertissement
--    ci-dessous, la signature ne bouge pas.
--
-- ⚠️ CE FICHIER REMPLACE `2026-08-29-tirage-en-base.sql` comme définition de
--    `parcours_pick` (celui-ci reste la définition de `parcours_radar`, qu'on ne
--    touche pas ici). Deux copies d'une même règle finissent toujours par
--    diverger : l'énoncé complet des règles de tirage vit désormais ICI.
--
-- ⚠️ SEULE la fonction `parcours_pick` change, et sa signature est identique :
--    le code déployé en production l'appelle exactement de la même façon et
--    reçoit exactement la même forme de résultat. Seul l'ORDRE de préférence
--    change. C'est donc sans danger à tout moment (pas de séquencement à tenir).
--
-- ─── La règle, et pourquoi ce n'est pas une interdiction ────────────────────
--
-- Décidée le 30/08/2026. Formulée d'abord comme « pas deux questions sur la même
-- notion principale », elle a été corrigée deux fois avant d'être juste :
--
--   1. **Sur la notion PRINCIPALE, c'est insuffisant.** Une question qui croise
--      plusieurs notions ramènerait par la bande celle qu'on vient de poser, en
--      la déclarant secondaire. La règle porte donc sur TOUTE notion que la
--      question fait travailler, principale ou non.
--   2. **En interdiction, c'est nuisible.** Un chapitre de trois notions verrait
--      son exercice s'arrêter au bout de trois questions, faute de candidate
--      sans notion déjà vue. Or un exercice écourté est bien pire qu'une notion
--      revue : le membre n'a rien fait de mal, et l'écran s'arrête sans raison
--      lisible.
--
-- D'où une PRÉFÉRENCE, et graduée : on trie sur le nombre de notions que la
-- grappe partage avec ce qui a déjà été posé dans CET exercice. Zéro d'abord,
-- une ensuite, deux après — et s'il ne reste que des grappes qui repassent sur
-- du déjà-vu, on repose plutôt que d'écourter. Ce n'est jamais la même question
-- (`parcours_asked` et `p_exclude` l'excluent déjà), et le départage par format
-- fait qu'elle ne se présente pas non plus sous la même forme.
--
-- ─── L'ordre de tri, et ce qui prime sur quoi ───────────────────────────────
--
--   1. `partage`  — notions déjà vues dans cet exercice, le moins possible.
--                   ⚠️ AVANT la priorité pédagogique, délibérément : « tant
--                   qu'une autre est disponible » veut dire que la variété
--                   l'emporte sur le fait de retourner à la notion la plus
--                   faible dès la question suivante. Elle y reviendra au tour
--                   d'après, ou à l'exercice suivant.
--   2. `weakest`  — la notion la moins maîtrisée d'abord (règle inchangée).
--   3. `formaste` — à faiblesse égale, une grappe qui apporte un format de
--                   réponse encore inutilisé dans cet exercice passe devant.
--                   Simple départage : il ne déplace jamais une grappe plus
--                   faible, il choisit entre des grappes équivalentes.
--   4. `random()` — comme avant, pour que le même enchaînement ne revienne pas.
--
-- `p_exclude` porte déjà les grappes posées dans l'exercice en cours (la trace
-- en base n'est écrite qu'à la correction) : c'est de lui que se déduisent les
-- notions et les formats déjà vus, sans nouveau paramètre ni second aller-retour.

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
  -- ─── Ce que l'exercice en cours a déjà fait travailler ────────────────────
  --
  -- Toutes les notions des grappes déjà posées, y compris celles qu'elles ne
  -- faisaient travailler qu'accessoirement : c'est tout l'objet de la
  -- correction du 30/08/2026.
  notions_posees as (
    select distinct c.brick_id
    from couples c
    where c.group_id = any(p_exclude) and c.brick_id is not null
  ),
  partage as (
    select c.group_id, count(distinct c.brick_id)::int as n
    from couples c
    where c.brick_id in (select brick_id from notions_posees)
    group by c.group_id
  ),
  -- Les formats de réponse déjà employés dans cet exercice. `min(...)` vaut 0
  -- dès qu'UN énoncé de la grappe apporte un format encore inédit : une grappe
  -- qui renouvelle la forme passe devant une grappe qui la répète.
  formats_poses as (
    select distinct i.response_type
    from exam_question_items i
    where i.group_id = any(p_exclude)
  ),
  formaste as (
    select i.group_id,
           min(case when i.response_type in (select response_type from formats_poses) then 1 else 0 end)::int as n
    from exam_question_items i
    group by i.group_id
  ),
  eligibles as (
    select
      g.group_id,
      k.cost,
      coalesce(f.weakest, 40) as weakest,
      coalesce(pa.n, 0) as partage,
      coalesce(fo.n, 0) as formaste
    from grappes g
    join cout k on k.group_id = g.group_id
    left join faiblesse f on f.group_id = g.group_id
    left join partage pa on pa.group_id = g.group_id
    left join formaste fo on fo.group_id = g.group_id
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
    order by el.partage asc, el.weakest asc, el.formaste asc, random()
    limit 1
  ) e on true;
$$;
