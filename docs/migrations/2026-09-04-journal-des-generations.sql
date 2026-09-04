-- Journal de bord des générations IA — appliqué le 04/09/2026.
--
-- ⚠️ Migration EXPAND, déjà appliquée : le code déployé ignore ces colonnes et
-- cette table, il n'y avait donc rien à attendre. Conservée ici comme trace.
--
-- Deux niveaux, décidés avec Alexis le 03/09/2026 après une panne de saturation
-- du fournisseur en pleine mise à jour d'atelier : rien ne permettait de savoir
-- si l'échec était exceptionnel ou quotidien.
--   • une ligne par GÉNÉRATION  → colonnes ajoutées à `ai_imports`, qui portait
--     déjà les tokens, le périmètre et la consigne de l'utilisateur ;
--   • une ligne par ÉTAPE       → `ai_import_events`.

alter table ai_imports add column if not exists outcome text;
alter table ai_imports add column if not exists origin text;
alter table ai_imports add column if not exists finished_at timestamptz;

comment on column ai_imports.outcome is
  'Issue de la génération : finished | stopped | failed. NULL = jamais refermée, donc interrompue (onglet fermé, serveur perdu).';
comment on column ai_imports.origin is
  'D''où vient la commande : settings-files | settings-notions | questions-parcours | questions-exam | refill.';

create table if not exists ai_import_events (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references ai_imports(id) on delete cascade,
  workshop_id uuid not null,
  -- Étape : chapters | notions | assign | questions | exam.
  step text not null,
  -- Indice du document ou du lot traité, NULL si l'étape est unique.
  batch integer,
  -- 1 = premier essai, 2 = relance automatique.
  attempt smallint not null default 1,
  provider text,
  model text,
  -- ok | failed.
  status text not null,
  -- Liste FERMÉE, sans quoi rien ne se compte : overloaded | unavailable |
  -- oversize | truncated | unreadable | quota | closed | unknown.
  cause text,
  -- La phrase brute du fournisseur, pour lire ce que le code ne sait pas classer.
  message text,
  duration_ms integer,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  -- Ce que l'étape a produit et écarté : des COMPTES et des motifs, jamais du
  -- contenu de document ni de donnée personnelle.
  produced jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_import_events_import_idx on ai_import_events (import_id);
create index if not exists ai_import_events_created_idx on ai_import_events (created_at desc);
create index if not exists ai_import_events_cause_idx on ai_import_events (cause) where cause is not null;

-- Modèle « server-only » du projet : RLS active, aucune policy (tout accès passe
-- par la service role key côté serveur). Voir .claude/rules/server-architecture.md.
alter table ai_import_events enable row level security;
