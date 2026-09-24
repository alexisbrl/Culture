-- Les tâches d'une génération IA — appliqué le 24/09/2026.
--
-- ⚠️ Migration EXPAND : une table neuve, que le code déployé ignore. Rien à
-- attendre avant de l'appliquer.
--
-- La génération ne vit plus dans l'onglet (docs/architecture.md §7.11) : chaque
-- appel au modèle est une TÂCHE rangée ici, qu'une fonction serveur prend, exécute
-- et referme, avant de lancer elle-même les suivantes. La table est la seule
-- mémoire de l'enchaînement — l'onglet peut se fermer, le serveur relit tout ici.

create table if not exists ai_import_tasks (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references ai_imports(id) on delete cascade,
  workshop_id uuid not null,
  -- Clé déterministe dans le lot (« notions:<chapitre> », « questions:<chapitre>:2 »…) :
  -- deux relais qui planifient la même étape en même temps écrivent la même clé,
  -- et l'unicité ci-dessous en garde une seule.
  key text not null,
  -- resource | chapters | chapters-relaunch | notions | questions | redites |
  -- finish | exam | mark (repère de planification, jamais exécuté).
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  -- pending | running | done | failed | skipped (lot refermé entre-temps).
  status text not null default 'pending',
  -- Essais réellement commencés. Une tâche coupée par la limite de durée de
  -- l'hébergeur est reprise UNE fois, jamais plus.
  attempts smallint not null default 0,
  -- Ce que la tâche a produit : des comptes, des identifiants et les écarts du
  -- compte-rendu — jamais d'extrait de document.
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (import_id, key)
);

-- La veille ne lit que les tâches en attente ou en cours.
create index if not exists ai_import_tasks_active_idx
  on ai_import_tasks (status, started_at)
  where status in ('pending', 'running');

-- Modèle « server-only » du projet : RLS active, aucune policy.
alter table ai_import_tasks enable row level security;
