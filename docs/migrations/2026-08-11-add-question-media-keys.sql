-- Pièces jointes d'énoncé (image / audio) sur les questions — additive,
-- appliquée directement (le code déployé l'ignore tant qu'il n'est pas mis à
-- jour). Remplace le "type de question" (textuel/visuel/audio) par deux
-- pièces jointes indépendantes. Voir QuestionMedia dans
-- src/lib/workshops/examTypes.ts.

alter table exam_questions
  add column if not exists image_key text null default null,
  add column if not exists audio_key text null default null;
