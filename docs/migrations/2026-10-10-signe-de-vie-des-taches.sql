-- Le signe de vie d'une tâche de génération, sur toute sa durée — 10/10/2026.
--
-- Additive uniquement (expand) : le code en ligne ignore cette colonne.
-- Appliquée immédiatement.
--
-- La tâche l'écrit en partant, puis toutes les quinze secondes jusqu'à sa fin,
-- appel au modèle ou non. La veille tient pour coupée une tâche dont le signe
-- a plus de trente secondes : elle la reprend sans attendre une durée fixe.
-- Vide : tâche prise par un code d'avant cette règle — la veille retombe alors
-- sur l'ancienne durée fixe.
alter table public.ai_import_tasks
  add column if not exists alive_at timestamptz;
