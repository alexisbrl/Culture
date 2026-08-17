-- Bascule du défaut de exam_questions.context : 'exam' -> 'parcours'.
--
-- Règle métier : un groupe de questions est TOUJOURS d'un côté ou de l'autre
-- (jamais ni l'un ni l'autre — c'est déjà garanti par NOT NULL + le CHECK), et
-- à défaut d'indication il doit aller dans le PARCOURS, pas dans la banque
-- d'examen.
--
-- ⚠️ PRÉREQUIS — à appliquer SEULEMENT une fois déployé le code qui passe le
-- contexte explicitement des DEUX côtés :
--   * app/actions/examQuestions.ts  -> saveQuestion(..., 'exam')
--   * app/actions/parcoursQuestions.ts -> saveQuestion(..., 'parcours')
--   * lib/workshops/exam.ts -> saveQuestion() exige désormais `context`
--     (paramètre obligatoire : un oubli casse le build).
--
-- Tant que scellow.com sert l'ANCIEN code, la banque d'examen crée ses
-- questions sans fournir de contexte et s'en remet à ce DEFAULT. Appliquer
-- cette migration avant le déploiement enverrait donc toutes les nouvelles
-- questions d'examen de la production dans le parcours, silencieusement (le
-- CHECK ne bronche pas : 'parcours' est une valeur légale). C'est exactement le
-- schéma de l'incident du 22/06/2026 — voir CLAUDE.md §1, expand/contract.
--
-- Une fois le code déployé, ce DEFAULT ne décide plus rien pour saveQuestion()
-- et ne sert plus que de filet : il ne s'applique qu'à un INSERT venu de
-- saveQuestions() (ré-écriture de masse), qui n'a pas vocation à créer de
-- lignes. Le changement est non destructif et n'affecte aucune ligne existante.

alter table exam_questions
  alter column context set default 'parcours';

-- Contrôle après application (doit renvoyer 'parcours'::text) :
--   select column_default from information_schema.columns
--    where table_name = 'exam_questions' and column_name = 'context';
