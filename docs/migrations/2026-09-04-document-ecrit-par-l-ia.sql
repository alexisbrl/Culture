-- Le document que l'IA écrit elle-même — appliqué le 04/09/2026.
--
-- ⚠️ Migration EXPAND, déjà appliquée : le code déployé ignore la colonne.
--
-- Un atelier a AU PLUS UN document écrit par l'IA : elle le crée à la première
-- consigne qui réclame de la matière, puis le reprend à chaque génération
-- suivante. L'utilisateur peut le lire, le télécharger et le supprimer — jamais
-- le modifier à la main ni le renommer : pour le changer, il passe par la
-- consigne de génération.
--
-- Un drapeau plutôt qu'une table : c'est un document de l'atelier comme les
-- autres (même stockage, même quota, lu par l'ingestion au même titre), et la
-- seule chose qui le distingue est qui l'a écrit.

alter table workshop_files add column if not exists generated boolean not null default false;

comment on column workshop_files.generated is
  'Écrit par l''IA à partir de la consigne de l''utilisateur, jamais téléversé. Au plus un par atelier ; non modifiable à la main.';

-- L'unicité est tenue EN BASE, pas seulement dans le code : deux générations qui
-- se croiseraient écriraient deux documents, et l'atelier aurait alors deux
-- sources de vérité qui se contredisent.
create unique index if not exists workshop_files_one_generated_per_workshop
  on workshop_files (workshop_id)
  where generated;
