-- 19/08/2026 — Verrouiller les types de réponse en base
--
-- Trois types ont été retirés du produit le 09/08/2026 (`sondage`, `ordre`,
-- `fill_blank`), un quatrième le 11/08 (`audio`), et la maquette avait laissé
-- quelques noms internes (`grille`, `texte`, `vide`, `match`). Jusqu'ici, rien
-- n'empêchait ces valeurs d'exister : la normalisation se faisait uniquement à
-- la LECTURE (`toResponseType`, src/lib/workshops/examTypes.ts), et la valeur
-- corrigée n'était réécrite qu'au premier enregistrement de la question.
--
-- Décision du 19/08/2026 : il ne doit plus être possible qu'une autre valeur que
-- les 9 types actuels se trouve en base. Une contrainte CHECK le garantit au
-- niveau où ça ne se contourne pas — y compris par un futur bug applicatif ou
-- par du SQL direct.
--
-- Enjeu au-delà du ménage : l'ingestion IA écrira des questions par centaines.
-- Un type inventé par un modèle n'a aucun mapping fondé (le replier sur
-- « textuelle » produirait un vrai/faux rendu en champ de texte libre, une
-- question silencieusement fausse) : il doit être rejeté, et cette contrainte
-- est le dernier filet si le rejet applicatif venait à manquer. Voir
-- docs/ai-ingestion-plan.md §7, règle « réparer ou rejeter ».
--
-- ✅ NON DESTRUCTIVE ET SANS ATTENTE DE DÉPLOIEMENT, malgré son caractère
-- restrictif : le contrôle de conformité ci-dessous renvoie 0, et le code
-- déployé n'écrit que des valeurs normalisées (toute Question passe par
-- `rowToQuestion`/`toResponseType` en lecture, et l'éditeur ne propose que
-- `RESPONSE_TYPE_ORDER`). Aucun chemin d'écriture ne peut produire autre chose.

-- Contrôle AVANT (doit renvoyer 0 — vérifié le 19/08/2026 : 0 sur 130 lignes) :
select count(*) as lignes_non_conformes
from public.exam_question_items
where response_type <> all (array[
  'sans_reponse','qcs','qcm','textuelle','liste','tableau','matching','dessin','fichier'
]);

-- Si le contrôle renvoie autre chose que 0, NORMALISER D'ABORD — mêmes mappings
-- que `toResponseType`, et surtout pas une suppression de lignes : ces questions
-- ont un contenu réel, écrit à la main.
--
--   update public.exam_question_items set response_type = case response_type
--     when 'sondage'    then 'qcm'          -- un sondage est un QCM sans bonne réponse
--     when 'ordre'      then 'liste'        -- trier dans l'ordre → liste numérotée
--     when 'fill_blank' then 'textuelle'
--     when 'audio'      then 'fichier'      -- type retiré le 11/08/2026
--     when 'grille'     then 'tableau'      -- noms internes de la maquette
--     when 'texte'      then 'textuelle'
--     when 'vide'       then 'sans_reponse'
--     when 'match'      then 'matching'
--     else 'textuelle'                      -- repli de `toResponseType`
--   end
--   where response_type <> all (array[
--     'sans_reponse','qcs','qcm','textuelle','liste','tableau','matching','dessin','fichier'
--   ]);

alter table public.exam_question_items
  add constraint exam_question_items_response_type_check
  check (response_type = any (array[
    'sans_reponse','qcs','qcm','textuelle','liste','tableau','matching','dessin','fichier'
  ]));

-- Contrôle APRÈS :
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'exam_question_items_response_type_check';
--
-- ⚠️ Le jour où un type de réponse est AJOUTÉ au produit, cette contrainte doit
-- être mise à jour dans la même migration que le code — sinon les nouvelles
-- questions seront rejetées en base. C'est le prix assumé du verrou.
