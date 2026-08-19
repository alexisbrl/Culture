-- 20/08/2026 — Étiqueter ce qui vient d'un import IA, et pouvoir l'annuler
--
-- Étape 4 du chantier d'ingestion (docs/ai-ingestion-plan.md §10 et §14).
--
-- ✅ MIGRATION EXPAND PURE — applicable immédiatement, sans attendre aucun
-- déploiement : rien n'est supprimé, rien n'est renommé, et toutes les colonnes
-- ajoutées sont nullables ou ont un défaut. Le code déployé les ignore.
--
-- ─── Ce que ça permet ────────────────────────────────────────────────────────
--
-- Une ligne sans `import_id` a été saisie à la main. Une ligne avec `import_id`
-- vient de ce lot d'import. Annuler un import, c'est donc
-- `delete … where import_id = $1` sur les trois tables — et les questions
-- emportent leurs `exam_question_items` et leurs liens de notions par cascade.
--
-- Ça sert bien au-delà de la panne : annuler un import qui a *techniquement
-- réussi* mais dont l'IA a mal compris le document. Aucune transaction ne donne
-- ça, et c'est pourquoi l'écriture n'a pas besoin d'être atomique.
--
-- ─── Pourquoi une table, alors que l'étiquette suffirait ─────────────────────
--
-- La conception initiale (20/07/2026) excluait toute table. Décision revue le
-- 19/08/2026 : l'annulation seule n'en a pas besoin, mais les QUOTAS et la
-- RÉ-INGESTION d'un même fichier en ont besoin tous les deux — savoir ce qui a
-- déjà été importé, quand, par qui, à quel coût. En prime : de quoi déboguer une
-- génération ratée et suivre la dépense réelle en tokens.
--
-- ─── Le piège que cette migration prépare ────────────────────────────────────
--
-- L'annulation n'est offerte que si RIEN du lot n'a été modifié depuis
-- l'import — ce qui se lit `updated_at > created_at`. Or `questionToRow`
-- (src/lib/workshops/exam.ts) écrit explicitement `updated_at` à chaque upsert,
-- création comprise : tout import passerait aussitôt pour « déjà modifié ».
--
-- La parade tient à une propriété de Postgres : `now()` renvoie l'heure de DÉBUT
-- DE TRANSACTION. Un INSERT qui omet `created_at` ET `updated_at` leur donne donc
-- une valeur strictement identique (les deux colonnes ont `default now()`,
-- vérifié le 20/08/2026 sur les quatre tables). L'écriture d'ingestion devra
-- omettre `updated_at` plutôt que de l'écrire — et surtout PAS se rabattre sur
-- une tolérance de quelques secondes, qui se dérègle toute seule.

create table if not exists public.ai_imports (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  -- Identifiant Clerk, en texte comme partout ailleurs (workshops.created_by).
  created_by    text not null,
  created_at    timestamptz not null default now(),
  -- Ce qui a été demandé : { chapters: bool, notions: bool, questions: bool, context: 'parcours'|'exam' }
  scope         jsonb not null default '{}'::jsonb,
  -- Les fichiers sources soumis au modèle (clés de stockage).
  file_ids      jsonb not null default '[]'::jsonb,
  -- Dépense réelle, pour les quotas et le suivi de coût.
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0
);

comment on table public.ai_imports is
  'Un lot de génération par IA. Les lignes produites portent son id dans import_id.';

-- `on delete set null` et non `cascade` : supprimer la trace d'un import ne doit
-- jamais supprimer le contenu qu'il a produit. L'annulation, elle, supprime
-- explicitement les lignes — c'est une opération voulue, pas un effet de bord.
alter table public.workshop_chapters add column if not exists import_id uuid
  references public.ai_imports(id) on delete set null;
alter table public.workshop_bricks   add column if not exists import_id uuid
  references public.ai_imports(id) on delete set null;
alter table public.exam_questions    add column if not exists import_id uuid
  references public.ai_imports(id) on delete set null;

-- Index partiels : l'annulation et le décompte filtrent sur `import_id`, et la
-- très grande majorité des lignes resteront saisies à la main (donc `null`).
create index if not exists workshop_chapters_import_id_idx
  on public.workshop_chapters (import_id) where import_id is not null;
create index if not exists workshop_bricks_import_id_idx
  on public.workshop_bricks (import_id) where import_id is not null;
create index if not exists exam_questions_import_id_idx
  on public.exam_questions (import_id) where import_id is not null;

create index if not exists ai_imports_workshop_created_idx
  on public.ai_imports (workshop_id, created_at desc);

-- Contrôle après application :
--   select column_name from information_schema.columns
--    where table_schema='public' and column_name='import_id';
--   -- attendu : exam_questions, workshop_bricks, workshop_chapters
