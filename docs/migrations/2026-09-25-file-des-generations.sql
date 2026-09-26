-- La file des générations d'un atelier — appliqué le 25/09/2026.
--
-- ⚠️ Migration EXPAND : une table neuve, que le code déployé ignore. Rien à
-- attendre avant de l'appliquer.
--
-- Une génération tourne à la fois par atelier (docs/architecture.md §7.11), mais
-- on peut en DEMANDER d'autres pendant qu'elle tourne : elles attendent ici, et
-- partent d'elles-mêmes, dans l'ordre, dès que la précédente est finie. Chaque
-- demande a sa ligne, du clic jusqu'à la fin — c'est elle que l'écran suit, et
-- elle rejoint son lot (`import_id`) quand elle démarre.

create table if not exists ai_generation_requests (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  created_by text not null,
  -- Ce que l'écran a demandé, tel quel (documents, contexte, consigne, porte
  -- d'entrée…). Relu au démarrage : ce qui dépend de l'état de l'atelier (le
  -- programme existe-t-il déjà ?) se recalcule à ce moment-là.
  input jsonb not null default '{}'::jsonb,
  -- Le serveur qui a reçu la demande : c'est lui qui la démarrera (le
  -- développement local partage la base avec la production).
  base_url text not null,
  -- Le lot ouvert au démarrage ; vide tant que la demande attend.
  import_id uuid references ai_imports(id) on delete set null,
  -- Posé par le serveur qui démarre la demande : deux serveurs qui voient la
  -- place se libérer au même instant n'en démarrent qu'un.
  started_at timestamptz,
  -- Le démarrage a échoué (document illisible, fournisseur en panne) : la
  -- demande ne repartira pas, l'écran le dit.
  error text,
  created_at timestamptz not null default now()
);

-- L'écran et la veille ne lisent que les demandes récentes d'un atelier.
create index if not exists ai_generation_requests_workshop_idx
  on ai_generation_requests (workshop_id, created_at);

-- Modèle « server-only » du projet : RLS active, aucune policy.
alter table ai_generation_requests enable row level security;
