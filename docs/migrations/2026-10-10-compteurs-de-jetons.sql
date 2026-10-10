-- Retrait des compteurs de jetons d'une génération — 10/10/2026.
--
-- ⚠️ CONTRACT : à n'appliquer qu'une fois en ligne le code qui ne les écrit plus
-- (branche fix/generation-cout-et-verrou). Le code en ligne avant elle écrit ces
-- colonnes à chaque appel ; les retirer avant ferait échouer ses générations.
--
-- Pourquoi : un seul compte fait foi, le journal de bord (`ai_import_events`,
-- vue `ai_generation_costs`). Ces compteurs s'additionnaient en lecture puis
-- écriture depuis des appels parallèles et perdaient des lots (un lot de
-- questions manquant le 07/10/2026). Plus rien ne les lit.

alter table public.ai_imports
  drop column if exists input_tokens,
  drop column if exists output_tokens,
  drop column if exists cached_tokens;
