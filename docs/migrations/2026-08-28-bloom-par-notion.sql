-- Le niveau de Bloom devient propre au COUPLE question ↔ notion.
--
-- ✅ DÉJÀ APPLIQUÉE le 28/08/2026 (migration additive, donc sans danger : le
--    code en ligne ignore la colonne). Conservée ici pour la trace.
--
-- Jusqu'ici le niveau n'existait qu'au niveau de la question
-- (exam_question_items.bloom_level) : une question portant trois notions les
-- évaluait toutes au même niveau, et la pastille affichée sur chaque notion
-- pilotait en réalité la question entière. Une question peut pourtant faire
-- RESTITUER une notion (niveau 1) et en faire ANALYSER une autre (niveau 4).
--
-- Colonne NULLABLE, et c'est le point : NULL = « ce lien suit le niveau de sa
-- question ». Aucun rattrapage de données, et un lien créé par un chemin qui
-- ignore encore cette colonne reste correct.
alter table public.exam_question_item_bricks
  add column if not exists bloom_level smallint;

comment on column public.exam_question_item_bricks.bloom_level is
  'Niveau de Bloom de CETTE notion pour CETTE question (1..6). NULL : suit exam_question_items.bloom_level.';

alter table public.exam_question_item_bricks
  add constraint exam_question_item_bricks_bloom_level_range
  check (bloom_level is null or (bloom_level between 1 and 6));
