-- Retrait de la colonne exam_questions.question_type — devenue morte le
-- 11/08/2026 : le type de question ('textuel' | 'visuel' | 'audio') a été
-- remplacé par deux pièces jointes indépendantes (image_key, audio_key),
-- voir src/lib/workshops/examTypes.ts (QuestionMedia). Le code déployé
-- n'écrit ni ne lit plus cette colonne à partir de ce commit.
--
-- Contract migration (retrait) : à appliquer SEULEMENT une fois ce code
-- déployé en production (CLAUDE.md §1, séquencement expand/contract).

alter table exam_questions
  drop column if exists question_type;
