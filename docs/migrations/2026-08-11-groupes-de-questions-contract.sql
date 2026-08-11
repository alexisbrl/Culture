-- Groupes de questions — phase CONTRACT (DESTRUCTIVE)
--
-- ⚠️ À N'APPLIQUER QU'APRÈS déploiement en production du code qui lit
-- `exam_question_items` (règle expand/contract, CLAUDE.md §1). Tant que
-- scellow.com sert l'ancien code, ces colonnes sont sa seule source de vérité
-- pour le contenu des questions : les supprimer avant casse la banque
-- d'examen, le parcours et les exercices — en silence.
--
-- Prérequis à vérifier AVANT (doit renvoyer 0) :
--   select count(*) from exam_questions q
--   where not exists (select 1 from exam_question_items i
--                     where i.group_id = q.id and i.sort_order = 0);

-- 1. Les colonnes de contenu : elles décrivaient la première question du groupe,
--    qui est désormais une ligne de `exam_question_items` comme les autres.
alter table public.exam_questions
  drop column if exists content,
  drop column if exists response_type,
  drop column if exists answer,
  drop column if exists choices,
  drop column if exists correct_choices,
  drop column if exists shuffle_choices,
  drop column if exists text_lines,
  drop column if exists type_options,
  drop column if exists expectations,
  drop column if exists bloom_level,
  -- Les questions liées, qui vivaient dans ce tableau jsonb.
  drop column if exists parts,
  -- Réglages jamais édités et jamais lus (retirés du modèle le 11/08/2026).
  drop column if exists answer_optional,
  drop column if exists difficulty,
  drop column if exists duration;

-- 2. L'ancienne jonction notions, qui reliait une notion au GROUPE. Les liens
--    sont désormais portés par la question (`exam_question_item_bricks`), et ont
--    été repris par la migration expand.
drop table if exists public.exam_question_bricks;
