-- 19/08/2026 — Une notion n'a plus qu'UN texte
--
-- Le titre et la description d'une notion disaient deux fois la même chose : la
-- liste n'affichait que le titre, la description ne se lisait qu'en rouvrant le
-- formulaire. Le champ unique est `title` — c'est déjà lui que lisent les autres
-- écrans (liaison aux questions d'examen, parcours). `content` disparaît.
--
-- DEUX PHASES, dans cet ordre, et surtout pas l'inverse.

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — expand/data : recoller les descriptions au titre.
--
-- À appliquer TOUT DE SUITE, avant ou après le déploiement, peu importe : le
-- code en ligne continue d'afficher `title` (plus long) et `content` (inchangé),
-- rien ne casse. C'est la seule phase qui touche à des données, et elle n'est
-- pas annulable — vérifier le SELECT de contrôle avant de lancer l'UPDATE.
--
-- Séparateur : un saut de ligne. Dans le formulaire (zone multi-lignes) il se
-- voit ; dans la liste, le texte est rendu en `white-space: normal`, le saut y
-- devient une espace.

-- Contrôle : combien de notions ont une description, et quelle longueur fera le
-- texte fusionné ? Au-delà de 280 caractères (NOTION_TITLE_MAX), la notion reste
-- lisible partout mais devra être raccourcie à la prochaine modification.
-- table encore nommée bricks en base — renommage différé, voir docs/backlog.md
select
  count(*)                                                as notions_avec_description,
  count(*) filter (where length(title) + 1 + length(content) > 280) as a_raccourcir
from public.workshop_bricks
where content is not null and btrim(content) <> '';

update public.workshop_bricks
set    title      = btrim(title) || E'\n' || btrim(content),
       updated_at = now()
where  content is not null
  and  btrim(content) <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — contract : supprimer la colonne.
--
-- À appliquer SEULEMENT une fois la branche mergée dans `main` ET déployée sur
-- Vercel. Avant ça, le code en production lit encore `content` dans son `select`
-- de liste : la colonne disparue, le select entier échoue et la page paramètres
-- perd toutes ses notions — en silence, `listNotions` n'ayant que `{ data }` à
-- lire (cf. CLAUDE.md §1 et l'incident du 22/06/2026).
--
-- Régénérer `src/lib/database.types.ts` après coup.

-- alter table public.workshop_bricks drop column content;
