-- Une génération IA à la fois par atelier — 29/08/2026
--
-- ─── Pourquoi ─────────────────────────────────────────────────────────────────
--
-- L'enchaînement des passes vit dans le NAVIGATEUR (voir l'en-tête de
-- `src/components/ai/AiGenerationDialog.tsx`) : rien, jusqu'ici, n'empêchait
-- d'ouvrir un second onglet sur le même atelier et d'y lancer une seconde
-- génération. Les deux réécrivent alors les mêmes chapitres et les mêmes
-- notions en même temps, et le ménage de fin de l'une peut cacher les chapitres
-- que l'autre vient de remplir. Sur deux ateliers DIFFÉRENTS, il n'y a aucun
-- risque de ce genre : seul le débit vers le fournisseur est partagé, et il se
-- régule tout seul.
--
-- ─── Pourquoi deux colonnes et pas un booléen ────────────────────────────────
--
-- Un verrou booléen posé par un onglet qui se ferme brutalement (plantage,
-- coupure réseau, machine éteinte) ne se relâche jamais : l'atelier resterait
-- bloqué sans que personne puisse rien y faire. Le verrou est donc un SIGNE DE
-- VIE, rafraîchi toutes les 30 s par l'onglet qui travaille :
--
--   • `beat_at`  — dernier battement. Un lot sans battement depuis plus de deux
--                  minutes est tenu pour abandonné, et cesse de bloquer.
--   • `closed_at`— fin propre (terminé, arrêté, en erreur). Relâche le verrou
--                  immédiatement, sans attendre l'expiration.
--
-- Les deux colonnes restent NULLES pour les lots de RECHARGE automatique
-- (`refillChapter`) : ceux-là tournent en tâche de fond, l'utilisateur n'en sait
-- rien, et les laisser bloquer un lancement manuel serait incompréhensible.
--
-- Migration purement ADDITIVE (règle expand/contract, CLAUDE.md §1) : le code
-- déployé ignore ces colonnes, elle peut donc être appliquée immédiatement.

alter table public.ai_imports
  add column if not exists beat_at   timestamptz,
  add column if not exists closed_at timestamptz;

comment on column public.ai_imports.beat_at is
  'Dernier signe de vie de l''onglet qui pilote ce lot (rafraîchi ~30 s). NULL = lot non interactif (recharge automatique).';
comment on column public.ai_imports.closed_at is
  'Fin de l''enchaînement piloté par le navigateur : terminé, arrêté ou en erreur. NULL tant qu''il tourne.';

-- La seule lecture qui s'appuie dessus : « cet atelier a-t-il un lot vivant ? ».
create index if not exists ai_imports_live_idx
  on public.ai_imports (workshop_id, beat_at desc)
  where closed_at is null;
