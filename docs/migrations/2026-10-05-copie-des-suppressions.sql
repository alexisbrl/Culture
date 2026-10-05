-- Copie des suppressions faites dans les paramètres d'atelier — appliqué le 05/10/2026.
--
-- ⚠️ Migration EXPAND : une table neuve, que le code déployé ignore. Rien à
-- attendre avant de l'appliquer.
--
-- Supprimer une notion ou un chapitre dans les paramètres efface tout de suite
-- (pour tout le monde), mais la page garde un bouton « annuler » : il faut donc
-- de quoi remettre exactement ce qui a été effacé — la ligne elle-même et ce
-- que la suppression emporte en cascade (progression des élèves, liens aux
-- questions). Cette copie vit ici, côté serveur, jamais dans le navigateur :
-- une restauration n'écrit que ce que le serveur a lui-même mis de côté.
-- Les copies de plus d'un jour sont purgées à chaque nouvelle suppression.

create table if not exists settings_trash (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  -- notion | chapter
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists settings_trash_created_idx on settings_trash (created_at);

-- Modèle « server-only » du projet : RLS active, aucune policy.
alter table settings_trash enable row level security;
