-- Rythme de réponse : une entrée par QUESTION, pas par grappe (30/08/2026)
--
-- Depuis que les questions liées se posent une par une, une grappe de cinq
-- questions bâclées doit se lire comme cinq fautes expédiées, pas comme une.
-- La ligne de `parcours_asked` reste unique par grappe — c'est elle qui dit
-- « posée », et le tirage exclut la grappe en entier, ses questions étant
-- inséparables. Le détail des réponses vit désormais dans `answers` :
--
--   [{ "ms": 2140, "correct": false, "at": "2026-08-30T18:12:03.114Z" }, …]
--
-- Migration ADDITIVE (expand) : le code déployé ignore la colonne, les lignes
-- existantes valent tableau vide et continuent d'être lues par les colonnes
-- `answer_ms`/`correct`, conservées. Leur suppression viendra plus tard, une
-- fois ce code en ligne (voir EN-ATTENTE-DEPLOIEMENT.md).

alter table parcours_asked
  add column if not exists answers jsonb not null default '[]'::jsonb;

comment on column parcours_asked.answers is
  'Une entrée par question répondue de la grappe : { ms, correct, at }. Lu par le détecteur de rythme (src/lib/workshops/answerPace.ts).';
