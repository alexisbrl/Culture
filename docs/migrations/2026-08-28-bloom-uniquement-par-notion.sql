-- Le niveau de Bloom n'existe plus QUE sur le lien question ↔ notion.
--
-- Suite directe de `2026-08-28-bloom-par-notion.sql`, qui avait ajouté le niveau
-- sur le lien en le laissant facultatif : NULL voulait dire « suit le niveau de
-- sa question ». Deux sources pour la même information, dont une seule était
-- affichée — l'énoncé gardait un niveau invisible que personne ne pouvait plus
-- régler. Le niveau appartient au couple : une question peut faire RESTITUER une
-- notion et en faire ANALYSER une autre.
--
-- ─── Deux temps, et l'ordre compte (CLAUDE.md §1, expand/contract) ───────────

-- ÉTAPE 1 — REPRISE DES DONNÉES. ✅ APPLIQUÉE le 28/08/2026.
--
-- Sans danger à tout moment : le code déployé en production ignore la colonne
-- `exam_question_item_bricks.bloom_level`, et la valeur qu'on y écrit est
-- exactement celle qu'il aurait lue sur la question. Rien ne change pour lui.
--
-- Sans elle, en revanche, les 27 questions qui portaient un niveau supérieur à 1
-- verraient toutes leurs notions retomber au niveau 1 le jour du déploiement :
-- le nouveau code lit un lien vide comme « niveau par défaut ». (Mesuré le
-- 28/08/2026 : 51 liens, tous sans niveau.)
update public.exam_question_item_bricks link
   set bloom_level = item.bloom_level
  from public.exam_question_items item
 where item.id = link.item_id
   and link.bloom_level is null;

-- ÉTAPE 2 — SUPPRESSION DE LA COLONNE. ⚠️ À N'APPLIQUER QU'APRÈS DÉPLOIEMENT
-- du code de la branche `feat/cout-ingestion-ia` en production.
--
-- Opération « contract » : tant que le code en ligne LIT `bloom_level` sur
-- `exam_question_items`, la retirer casse la lecture des questions — et souvent
-- en silence (beaucoup de `select` ignorent `{ error }`). Voir l'incident du
-- 22/06/2026 dans docs/changelog.md.
--
-- La colonne a un défaut (1) et est NOT NULL : le nouveau code, qui ne l'écrit
-- plus, produit donc des lignes valides sans elle. Il n'y a rien à faire d'autre
-- qu'attendre.
--
-- alter table public.exam_question_items drop column bloom_level;
