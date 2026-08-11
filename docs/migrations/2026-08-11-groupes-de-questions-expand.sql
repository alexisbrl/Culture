-- Groupes de questions — phase EXPAND (non destructive, applicable immédiatement)
--
-- Contexte : une question était une ligne `exam_questions` portant à la fois les
-- éléments COMMUNS d'un groupe (image, audio, libellés, chapitre) ET le contenu
-- de sa première question (énoncé, type de réponse, réponse…), les questions
-- liées suivantes vivant dans le tableau jsonb `parts`. Structure asymétrique :
-- la première question n'avait pas la même forme que les autres, ni en base ni
-- dans le contrat exposé à l'IA.
--
-- Cible : `exam_questions` devient le GROUPE (rien que le commun), et chaque
-- question — la première comprise — devient une ligne de `exam_question_items`,
-- typée et contrainte comme les autres.
--
-- Cette migration ne SUPPRIME rien : les colonnes et le jsonb `parts` restent en
-- place, le code déployé en production continue donc de fonctionner. Leur
-- suppression est la phase CONTRACT, à appliquer seulement après déploiement du
-- code qui ne les lit plus (règle expand/contract, CLAUDE.md §1) :
-- voir 2026-08-11-groupes-de-questions-contract.sql.

-- ─── 1. Les questions du groupe ──────────────────────────────────────────────

create table if not exists public.exam_question_items (
  -- Fourni par l'application, jamais par la base : la première question d'un
  -- groupe reprend l'identifiant du groupe (continuité avec les clés de barème
  -- et les liens de notions existants), les suivantes ont le leur.
  id text primary key,
  group_id text not null references public.exam_questions(id) on delete cascade,
  -- Position dans le groupe : 0 = question principale. Nommée `sort_order` et
  -- non `position`, qui est un mot-clé Postgres ambigu en contexte d'expression.
  sort_order smallint not null,
  content text not null default '',
  response_type text not null default 'textuelle',
  answer text not null default '',
  choices jsonb not null default '[]'::jsonb,
  correct_choices jsonb not null default '[]'::jsonb,
  shuffle_choices boolean not null default false,
  text_lines integer not null default 4,
  type_options jsonb not null default '{}'::jsonb,
  expectations text not null default '',
  -- Même garantie que sur l'ancienne colonne : 4 niveaux, jamais nul.
  bloom_level smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_question_items_bloom_level_check check (bloom_level between 1 and 4),
  constraint exam_question_items_sort_order_check check (sort_order >= 0),
  -- DEFERRABLE : vérifiée à la fin de la transaction, pas ligne à ligne. Sans
  -- ça, réordonner deux questions liées (1↔2) échouerait sur une collision
  -- transitoire alors que l'état final est valide. L'unicité reste garantie à
  -- chaque commit. Non utilisée comme arbitre d'`ON CONFLICT` (c'est la clé
  -- primaire `id` qui l'est), donc aucune limitation à l'écriture.
  constraint exam_question_items_group_order_key unique (group_id, sort_order) deferrable initially deferred
);

create index if not exists exam_question_items_group_id_idx
  on public.exam_question_items (group_id);

-- Accès 100 % côté serveur via la service role key : RLS activée, aucune policy
-- (doctrine du projet, voir .claude/rules/server-architecture.md).
alter table public.exam_question_items enable row level security;

-- ─── 2. Notions couvertes, par question et non plus par groupe ───────────────
--
-- Nouvelle table plutôt qu'un changement de clé étrangère sur
-- `exam_question_bricks` : celle-ci reste intacte pour le code encore déployé.
-- (« bricks » = notions ; la table historique garde ce nom, voir docs/backlog.md)

create table if not exists public.exam_question_item_bricks (
  item_id text not null references public.exam_question_items(id) on delete cascade,
  brick_id uuid not null references public.workshop_bricks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, brick_id)
);

create index if not exists exam_question_item_bricks_brick_id_idx
  on public.exam_question_item_bricks (brick_id);

alter table public.exam_question_item_bricks enable row level security;

-- ─── 3. Reprise de l'existant ────────────────────────────────────────────────

-- 3a. La question principale de chaque groupe : elle reprend l'identifiant du
--     groupe, donc les clés de barème (`ExamConfig.weighting`) et les liens de
--     notions déjà enregistrés restent valides.
insert into public.exam_question_items (
  id, group_id, sort_order, content, response_type, answer, choices, correct_choices,
  shuffle_choices, text_lines, type_options, expectations, bloom_level, created_at, updated_at
)
select
  q.id, q.id, 0, q.content, q.response_type, q.answer, q.choices, q.correct_choices,
  q.shuffle_choices, q.text_lines, q.type_options, q.expectations,
  least(greatest(q.bloom_level, 1), 4), q.created_at, q.updated_at
from public.exam_questions q
on conflict (id) do nothing;

-- 3b. Les questions liées, dans l'ordre du tableau jsonb. `with ordinality`
--     commence à 1 : c'est exactement leur position, la principale occupant 0.
insert into public.exam_question_items (
  id, group_id, sort_order, content, response_type, answer, choices, correct_choices,
  shuffle_choices, text_lines, type_options, expectations, bloom_level
)
select
  coalesce(nullif(p.part->>'id', ''), q.id || '::part' || (p.ord - 1)),
  q.id,
  p.ord::smallint,
  coalesce(p.part->>'content', ''),
  coalesce(nullif(p.part->>'responseType', ''), 'textuelle'),
  coalesce(p.part->>'answer', ''),
  coalesce(p.part->'choices', '[]'::jsonb),
  coalesce(p.part->'correctChoices', '[]'::jsonb),
  coalesce((p.part->>'shuffleChoices')::boolean, false),
  coalesce((p.part->>'textLines')::integer, 4),
  coalesce(p.part->'typeOptions', '{}'::jsonb),
  coalesce(p.part->>'expectations', ''),
  least(greatest(coalesce((p.part->>'bloomLevel')::integer, 1), 1), 4)::smallint
from public.exam_questions q
cross join lateral jsonb_array_elements(coalesce(q.parts, '[]'::jsonb)) with ordinality as p(part, ord)
on conflict (id) do nothing;

-- 3c. Les notions déjà reliées portaient sur le groupe : elles décrivent en fait
--     sa question principale (les questions liées n'en avaient pas encore).
insert into public.exam_question_item_bricks (item_id, brick_id)
select i.id, b.brick_id
from public.exam_question_bricks b
join public.exam_question_items i on i.group_id = b.question_id and i.sort_order = 0
on conflict do nothing;
