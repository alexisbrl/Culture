-- Ce qu'un membre a déjà vu passer, dans le parcours.
--
-- ✅ APPLIQUÉE le 28/08/2026 (création de table : migration additive, donc sans
--    danger — le code déployé ignore ce qui n'existait pas quand il est parti).
--
-- ─── Pourquoi cette table ────────────────────────────────────────────────────
--
-- Jusqu'ici l'exercice tirait une question au hasard parmi celles du chapitre et
-- n'en gardait aucune trace : la même question pouvait retomber trois fois de
-- suite, et « question disponible » — c'est-à-dire jamais posée à CE membre —
-- ne pouvait pas être calculé. C'est pourtant la mesure sur laquelle repose
-- toute la recharge automatique : elle se déclenche quand un membre n'a plus
-- assez de questions inédites sur un couple (notion, niveau).
--
-- ─── Ce qu'on enregistre, et à quel moment ───────────────────────────────────
--
-- Le GROUPE (`exam_questions.id`), pas chaque énoncé : un groupe est posé d'un
-- bloc, ses questions liées avec lui.
--
-- ⚠️ RÈGLE RÉVISÉE LE 29/08/2026 — l'écriture se fait à la CORRECTION, pas au
-- tirage. On avait tranché l'inverse la veille (une question vue puis
-- abandonnée serait « brûlée pour la révision »). Décision produit contraire :
-- ne pas répondre ne mesure rien, donc ne consomme rien — la question reste
-- disponible. La colonne s'appelle toujours `asked_at`, et c'est bien la date
-- de la première RÉPONSE ; renommer coûterait une migration restrictive pour
-- un mot.
--
-- ⚠️ `exam_questions.id` est du TEXT et non de l'uuid (héritage). La clé
-- étrangère doit donc l'être aussi, sans quoi la création échoue.
create table if not exists public.parcours_asked (
  id uuid primary key default gen_random_uuid(),
  -- Redondant avec le groupe, qui porte déjà son atelier — mais c'est ce qui
  -- permet de compter les questions vues d'un membre sans jointure, sur le
  -- chemin chaud du radar.
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  -- Identifiant Clerk, en texte : même forme que `workshop_members.user_id` et
  -- `brick_mastery.user_id`. Pas de clé étrangère, Clerk n'étant pas en base.
  user_id text not null,
  group_id text not null references public.exam_questions(id) on delete cascade,
  asked_at timestamptz not null default now(),
  -- Un membre ne répond à une question qu'une fois : c'est l'invariant même de
  -- « disponible ». L'écriture est donc un upsert qui ne fait rien s'il y a
  -- déjà une ligne, et une seconde réponse ne rajeunit pas la date.
  unique (user_id, group_id)
);

-- Le radar lit toujours « ce que CE membre a vu dans CET atelier ».
create index if not exists parcours_asked_workshop_user_idx
  on public.parcours_asked (workshop_id, user_id);

-- RLS activée sans aucune policy : modèle « server-only » de tout le projet,
-- l'accès passant exclusivement par la service role key qui la contourne.
-- Voir .claude/rules/server-architecture.md.
alter table public.parcours_asked enable row level security;
