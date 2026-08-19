-- 19/08/2026 — Une question n'a plus de chapitre à elle
--
-- Le chapitre d'une question de parcours se déduit désormais des NOTIONS qu'elle
-- mobilise, exactement comme le filtre « chapitre » de la banque d'examen le
-- faisait déjà (`chaptersOfQuestion`). Le sélecteur de chapitre a disparu de la
-- liste des questions du parcours, et le tirage d'un exercice passe par
-- `parcoursQuestionIdsOfChapter` (`src/lib/workshops/exam.ts`) : notions du
-- chapitre → `exam_question_item_bricks` → `exam_question_items` → groupes.
--
-- `exam_questions.chapter_id` n'est donc plus ni lue ni écrite par le code.
--
-- ⚠️ CONTRACT — à appliquer SEULEMENT une fois la branche mergée dans `main` ET
-- déployée sur Vercel. Avant ça, le code en production lit encore cette colonne
-- dans `GROUP_COLUMNS` (donc dans TOUS les `select` de questions, examen
-- compris) et s'en sert pour tirer les exercices : la colonne disparue, ces
-- select échouent en bloc et les deux écrans se vident sans erreur visible
-- (cf. CLAUDE.md §1 et l'incident du 22/06/2026).
--
-- Régénérer `src/lib/database.types.ts` après coup.

-- Contrôle : ce qui va être perdu, c'est le rattachement manuel saisi jusqu'ici.
-- Les questions dont AUCUNE notion n'est rangée dans un chapitre ne seront plus
-- tirées par aucun exercice tant qu'on ne leur aura pas relié une notion rangée.
select
  count(*) filter (where q.chapter_id is not null) as questions_avec_chapitre_manuel,
  count(*) filter (
    where q.chapter_id is not null
      and not exists (
        select 1
        from public.exam_question_items i
        join public.exam_question_item_bricks ib on ib.item_id = i.id
        join public.workshop_bricks b on b.id = ib.brick_id
        where i.group_id = q.id and b.chapter_id is not null
      )
  ) as a_relier_a_une_notion_rangee
from public.exam_questions q
where q.context = 'parcours';

-- alter table public.exam_questions drop column chapter_id;
