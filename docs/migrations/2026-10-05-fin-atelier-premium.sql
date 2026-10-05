-- Fin de l'atelier Premium (contract) — l'abonnement se porte sur le compte.
--
-- PRÉREQUIS : le code qui ne lit plus `workshops.is_premium` (branche du
-- 05/10/2026 : page Atelier Premium retirée des paramètres, activation par mot
-- de passe supprimée, badges retirés) doit être MERGÉ et DÉPLOYÉ sur
-- get-culture.com. Avant cela, le code en ligne nomme encore ces colonnes dans
-- ses `select` et casserait en silence (CLAUDE.md §1, expand/contract).
--
-- Au 05/10/2026 : 7 ateliers portent is_premium = true. La valeur est perdue,
-- c'est voulu — plus rien ne la lit.

drop trigger if exists trg_prevent_workshop_premium_downgrade on public.workshops;
drop function if exists public.prevent_workshop_premium_downgrade();

alter table public.workshops
  drop column if exists is_premium,
  drop column if exists premium_activated_at;

-- Même déploiement : la description d'atelier, retirée de l'écran et des
-- consignes de génération le 05/10/2026. 4 ateliers en portaient une au
-- 05/10/2026 ; le texte est perdu, c'est voulu.
alter table public.workshops drop column if exists description;
