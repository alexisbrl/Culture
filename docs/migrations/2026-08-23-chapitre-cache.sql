-- 23/08/2026 — État « caché » d'un chapitre
--
-- Feuille de route : docs/chantiers/2026-08-23-notions-dabord.md (T1)
--
-- Un chapitre qui n'est plus d'actualité est CACHÉ, avec les notions qu'il
-- contient — jamais supprimé, jamais vidé. C'est ce qui rend une mise à jour
-- d'atelier traçable et réversible : l'ancien reste consultable.
--
-- Migration ADDITIVE (expand) : sans danger à tout moment, le code déployé en
-- production ignore la colonne. `default false` garantit que tous les chapitres
-- existants restent visibles. Voir CLAUDE.md §1, règle expand/contract.
--
-- Appliquée le 23/08/2026.

alter table public.workshop_chapters
  add column if not exists hidden boolean not null default false;

comment on column public.workshop_chapters.hidden is
  'Chapitre mis à l''écart : il et ses notions sortent du programme (parcours, examen, maîtrise) mais restent consultables. Jamais posé automatiquement sans validation — voir docs/chantiers/2026-08-23-notions-dabord.md §5.';

-- Index partiel : toutes les lectures du programme filtrent sur `hidden = false`,
-- et les chapitres cachés sont par nature une minorité.
create index if not exists workshop_chapters_workshop_visible_idx
  on public.workshop_chapters (workshop_id, position)
  where hidden = false;
