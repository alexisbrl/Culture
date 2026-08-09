-- Progression du parcours : score de maîtrise par (utilisateur × notion).
--
-- ✅ APPLIQUÉE le 06/08/2026 sur le projet `hhkmrejjksjpfetwefju`
--    (migration Supabase `brick_mastery_score`), types régénérés dans la foulée.
--
-- Migration purement ADDITIVE (expand, cf. CLAUDE.md §1) : `brick_mastery` est
-- vide et aucun code déployé en production ne la lit — application sans risque
-- à tout moment, avant comme après le déploiement du code.
--
-- Modèle implémenté par src/lib/workshops/mastery.ts :
--   score 0-40, 10 points par niveau de Bloom atteint (4 niveaux utiles)
--   bonne réponse : score += floor(min(T - score, (T - score) * 0,4 + 1,5))
--   avec T = 10 × min(bloom_level de la question, 4)
--   mauvaise réponse : score inchangé
--   avancement affiché = min(score, 30) / 30

alter table public.brick_mastery
  add column if not exists score smallint not null default 0;

alter table public.brick_mastery
  drop constraint if exists brick_mastery_score_check;

alter table public.brick_mastery
  add constraint brick_mastery_score_check check (score >= 0 and score <= 40);

comment on column public.brick_mastery.score is
  'Score de maîtrise 0-40 (10 points par niveau de Bloom atteint). Alimenté par les bonnes réponses du parcours.';

-- bloom_level devient une valeur dérivée du score : il doit pouvoir valoir 0
-- (notion jamais travaillée), alors que le check d'origine imposait 1..6.
alter table public.brick_mastery
  drop constraint if exists brick_mastery_bloom_level_check;

alter table public.brick_mastery
  add constraint brick_mastery_bloom_level_check check (bloom_level >= 0 and bloom_level <= 6);

alter table public.brick_mastery
  alter column bloom_level set default 0;

comment on column public.brick_mastery.bloom_level is
  'Niveau de Bloom ATTEINT, dérivé du score (floor(score/10), plafonné à 4) : 0=aucun, 1=mémoriser, 2=comprendre, 3=appliquer, 4=analyser. 5-6 réservés.';

-- Une seule ligne de maîtrise par (utilisateur, notion) — indispensable pour
-- l'upsert `on conflict (user_id, brick_id)` du calcul de progression.
create unique index if not exists brick_mastery_user_brick_key
  on public.brick_mastery (user_id, brick_id);
