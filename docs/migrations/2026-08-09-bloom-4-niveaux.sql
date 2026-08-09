-- Bloom ramené à 4 niveaux (mémoriser, comprendre, appliquer, analyser).
--
-- ⚠️ À APPLIQUER SEULEMENT APRÈS DÉPLOIEMENT du code de la branche
-- feat/progression-parcours en production. Resserrer une contrainte est une
-- opération « contract » (CLAUDE.md §1) : tant que le code en ligne peut encore
-- écrire un niveau 5 ou 6 (ancien sélecteur à 6 crans du popup QuestionEditor),
-- l'appliquer ferait échouer ses écritures.
--
-- Aucune migration de données n'est nécessaire : vérifié le 09/08/2026,
-- 0 ligne de exam_questions porte un bloom_level > 4, et brick_mastery.bloom_level
-- est dérivé de masteryLevel() qui plafonne déjà à MAX_LEVEL = 4.
-- Le filet applicatif est en place depuis le 09/08/2026 : toBloomLevel() ramène
-- toute valeur >= 4 sur 4.

-- Filet de sécurité si des lignes hors bornes sont apparues entre-temps :
update public.exam_questions set bloom_level = 4 where bloom_level > 4;
update public.brick_mastery  set bloom_level = 4 where bloom_level > 4;

alter table public.exam_questions drop constraint exam_questions_bloom_level_check;
alter table public.exam_questions add constraint exam_questions_bloom_level_check
  check (bloom_level >= 1 and bloom_level <= 4);

alter table public.brick_mastery drop constraint brick_mastery_bloom_level_check;
alter table public.brick_mastery add constraint brick_mastery_bloom_level_check
  check (bloom_level >= 0 and bloom_level <= 4);
