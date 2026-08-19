-- 19/08/2026 — Une question n'a plus de titre
--
-- `exam_questions.title` n'a jamais fait partie des 14 colonnes de contenu
-- retirées le 11/08/2026 (elles étaient parties dans `exam_question_items`) :
-- elle est restée sur la ligne du GROUPE, avec l'image, le son et les libellés.
-- Mais plus rien ne permettait de la remplir depuis que l'éditeur en popup a
-- cédé la place à l'éditeur en ligne, qui n'a pas de champ titre. Il ne restait
-- donc que des valeurs figées, saisies avant ce changement — et elles masquaient
-- l'énoncé dans la banque comme dans la liste du parcours, qui affichaient
-- `title || content`.
--
-- Le code ne lit ni n'écrit plus cette colonne : elle a quitté `GROUP_COLUMNS`,
-- le type `Question`, `QuestionGroup` et `ExercisePrompt`.
--
-- ⚠️ CONTRACT — à appliquer SEULEMENT une fois la branche mergée dans `main` ET
-- déployée sur Vercel. Avant ça, le code en production lit encore `title` dans
-- `GROUP_COLUMNS`, donc dans TOUS les select de questions : la colonne disparue,
-- ces select échouent en bloc et la banque comme le parcours se vident sans la
-- moindre erreur visible (cf. CLAUDE.md §1 et l'incident du 22/06/2026).
--
-- Régénérer `src/lib/database.types.ts` après coup.

-- Contrôle : combien de questions portent encore un titre, et donc combien de
-- lignes verront leur libellé changer dans les listes (elles afficheront
-- désormais leur énoncé).
select count(*) as questions_avec_titre
from public.exam_questions
where title is not null and btrim(title) <> '';

-- alter table public.exam_questions drop column title;
