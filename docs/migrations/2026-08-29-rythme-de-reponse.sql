-- De quoi repérer un membre qui répond au hasard.
--
-- ✅ APPLIQUÉE le 29/08/2026 (ajout de colonnes nullables + index : additif,
--    donc sans danger — le code déployé ignore ce qu'il ne connaît pas).
--
-- ─── Le problème, qui n'est pas la triche ────────────────────────────────────
--
-- Un parcours d'entraînement montre la réponse dès qu'on valide : tricher n'a
-- aucun intérêt, et c'est assumé. Ce qui coûte, c'est le GÂCHIS DE STOCK — une
-- question répondue est consommée, juste ou fausse, donc quelques minutes de
-- clics au hasard vident un chapitre et déclenchent une recharge payante pour
-- rien.
--
-- Remettre les mauvaises réponses au tirage est écarté (29/08/2026) : ça
-- donnerait le moyen d'aller vite pour se faire montrer toutes les réponses,
-- puis de repasser en les connaissant. On préfère avertir.
--
-- ─── Pourquoi le temps vient de l'écran, et pas du serveur ───────────────────
--
-- ⚠️ Le serveur ne peut PAS mesurer ce temps lui-même. Depuis les deux questions
-- d'avance, une question est tirée bien avant d'être affichée : l'écart entre le
-- tirage et la réponse inclut la lecture de la correction précédente, donc il
-- surestime largement le temps réel et laisserait justement passer un cliqueur.
-- C'est l'écran qui envoie le temps d'affichage. C'est falsifiable, et ça suffit
-- : on vise l'avertissement d'un membre qui se disperse, pas un verrou.
--
--   answer_ms : millisecondes entre l'affichage de la question et la validation,
--               rapporté par l'écran et borné côté serveur. NULL pour les
--               réponses d'avant cette date.
--   correct   : la grappe est-elle réussie ? Même règle que la goutte de
--               l'exercice — aucun énoncé faux, et au moins un corrigé
--               automatiquement. NULL quand rien n'était corrigeable.
--
-- La règle de détection (5 dernières réponses, seuils) est une règle produit :
-- elle vit dans `src/lib/workshops/answerPace.ts`, pas ici.

alter table public.parcours_asked
  add column if not exists answer_ms int,
  add column if not exists correct boolean;

-- Le détecteur lit « les 5 dernières réponses de ce membre dans cet atelier ».
create index if not exists parcours_asked_user_recent_idx
  on public.parcours_asked (user_id, workshop_id, asked_at desc);
