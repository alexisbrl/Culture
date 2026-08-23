-- 24/08/2026 — Provenance des notions et plage de pages des chapitres
--
-- Feuille de route : docs/chantiers/2026-08-23-notions-dabord.md (T3 bis).
--
-- ─── À quoi ça sert ─────────────────────────────────────────────────────────
--
-- Depuis l'inversion des passes, le RANGEMENT des notions se fait dans un appel
-- séparé qui ne reçoit PAS le cours (c'est ce qui le rend bon marché). Or le
-- cours portait une information que la notion seule ne porte pas : l'endroit
-- d'où elle vient. « L'imprimerie diffuse les textes humanistes » peut aller
-- dans « Humanisme » comme dans un chapitre sur la diffusion des savoirs ; c'est
-- sa place dans le cours qui tranche.
--
-- Plutôt que de renvoyer le corpus — l'erreur de coût du 22/08/2026 —, on retient
-- la provenance au moment où l'élément est créé :
--
--   • une notion sait de quel document et de quelle page elle vient ;
--   • un chapitre sait sur quelles pages il court, approximativement.
--
-- Le rangement croise les deux et n'a plus besoin du cours. Deux nombres par
-- élément contre 680 000 tokens de corpus.
--
-- ⚠️ **La page indique, le contenu décide.** Un chapitre ne s'arrête pas au bas
-- d'une page : une notion du haut de la page 40 appartient souvent encore au
-- chapitre précédent. La consigne le dit explicitement, sous peine que le modèle
-- range mécaniquement au numéro de page et cesse de lire la notion — ce qui
-- produirait des rangements plausibles mais faux, donc invisibles à l'œil.
--
-- Toutes les colonnes sont NULLABLES : rien n'est rétroactif, les notions et
-- chapitres déjà en base n'ont pas de provenance et le rangement doit s'en
-- passer sans broncher.
--
-- Migration ADDITIVE (expand) : sans danger, le code déployé les ignore.
-- Voir CLAUDE.md §1, règle expand/contract.

alter table public.workshop_bricks
  add column if not exists source_document text,
  add column if not exists source_page integer;

comment on column public.workshop_bricks.source_document is
  'Nom du document source d''où la notion a été extraite. Sert au rangement, qui ne reçoit pas le cours.';
comment on column public.workshop_bricks.source_page is
  'Page approximative du document source. Indication, jamais une contrainte.';

alter table public.workshop_chapters
  add column if not exists source_document text,
  add column if not exists page_start integer,
  add column if not exists page_end integer;

comment on column public.workshop_chapters.source_document is
  'Document où ce chapitre commence. Null pour un chapitre écrit à la main ou couvrant plusieurs documents.';
comment on column public.workshop_chapters.page_start is
  'Première page approximative du chapitre. Indication donnée au rangement, jamais une contrainte : le contenu de la notion prime toujours.';
comment on column public.workshop_chapters.page_end is
  'Dernière page approximative du chapitre. Même réserve que page_start.';
