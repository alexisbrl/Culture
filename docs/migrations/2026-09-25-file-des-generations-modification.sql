-- La file des générations : une demande en cours de modification — appliqué le 25/09/2026.
--
-- ⚠️ Migration EXPAND : une colonne neuve, que le code déployé ignore. Rien à
-- attendre avant de l'appliquer.
--
-- Pendant qu'on modifie la consigne d'une demande qui attend, la file la SAUTE :
-- la suivante peut partir, et elle garde sa place pour quand la modification est
-- enregistrée ou abandonnée. La mise à l'écart expire d'elle-même — un encadré
-- de modification oublié ouvert ne bloque pas la demande indéfiniment.

alter table ai_generation_requests add column if not exists held_until timestamptz;
