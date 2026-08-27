// Correction d'un énoncé d'exercice : ce qui juge une réponse, et rien d'autre.
//
// Module PUR, sans Supabase — c'est la condition pour qu'il soit testé. La
// réponse d'un candidat est une entrée non fiable (elle arrive par une server
// action, donc par une URL POST publique) et le verdict décide d'un crédit de
// maîtrise : c'est exactement le genre de fonction que la discipline de tests du
// projet demande de couvrir. Extrait de `exam.ts` le 25/08/2026, en même temps
// que l'ouverture de la correction à la liste, au tableau et aux paires.

import { isListCorrect } from '@/lib/workshops/answerMatch';
import { matchPairs } from '@/lib/workshops/examTypes';
import type {
  ExerciseAnswer,
  ExerciseResult,
  QuestionTypeOptions,
  ResponseType,
} from '@/lib/workshops/examTypes';

/** L'énoncé tel que la correction a besoin de le connaître — jamais un
 *  `Question` complet : ce module ne lit rien en base et n'a que faire du
 *  reste. */
export type GradableStatement = {
  responseType: ResponseType;
  answer?: string;
  choices?: string[];
  correctChoices?: number[];
  typeOptions?: QuestionTypeOptions | null;
};

/** Deux ensembles de cases cochées sont-ils les mêmes ? L'ordre ne compte pas :
 *  cocher A puis C, ou C puis A, c'est la même réponse. */
export function sameChoiceSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/** Correction d'UN énoncé.
 *
 *  ─── Quatre types jugés, et pourquoi pas les autres ────────────────────────
 *
 *  Le QCM, la LISTE, le TABLEAU et les PAIRES portent une réponse juste connue
 *  au caractère près : la machine peut trancher. Jusqu'au 25/08/2026 elle ne le
 *  faisait que pour le QCM — les trois autres s'affichaient, se remplissaient,
 *  et ressortaient « pas de correction automatique », donc sans jamais créditer
 *  la moindre progression (le crédit de maîtrise ne suit qu'un `correct === true`).
 *  C'est ce qui bornait en pratique la génération par IA au QCM.
 *
 *  La réponse rédigée, le dessin et le dépôt de fichier restent à `null` : leur
 *  jugement demande un correcteur, humain ou assisté. `sans_reponse` aussi — il
 *  n'y a rien à juger, l'énoncé ne fait qu'afficher.
 *
 *  ─── Tout ou rien ──────────────────────────────────────────────────────────
 *
 *  Aucun crédit partiel, comme pour le QCM depuis toujours : trois cases justes
 *  sur quatre, c'est faux. La maîtrise se mesure à la notion, pas à la case.
 *
 *  ─── Pas de référence, pas de verdict ──────────────────────────────────────
 *
 *  ⚠️ Un énoncé dont la réponse juste est ABSENTE (une liste sans réponse
 *  attendue, une grille sans case cochée) ne rend pas « faux » : il rend `null`,
 *  comme une réponse rédigée. Sanctionner reviendrait à punir le candidat d'un
 *  énoncé mal saisi, et ça arrive pour de bon — certaines listes écrites à la
 *  main portent leurs attendus dans le texte libre plutôt que ligne par ligne
 *  (constaté sur des questions existantes le 25/08/2026). Le candidat voit alors
 *  la réponse attendue et se juge, exactement comme avant.
 */
export function gradeStatement(source: GradableStatement, answer: ExerciseAnswer): ExerciseResult {
  const base = {
    answer: source.answer ?? '',
    correctChoices: source.correctChoices ?? [],
  };

  switch (source.responseType) {
    case 'qcs':
    case 'qcm':
      return { ...base, correct: sameChoiceSet(answer.choices, source.correctChoices ?? []) };

    case 'liste': {
      // `choices` porte les réponses attendues (jamais envoyées au candidat).
      const expected = (source.choices ?? []).filter((entry) => entry.trim().length > 0);
      if (expected.length === 0) return { ...base, correct: null };
      return { ...base, correct: isListCorrect(answer.list, expected), correctList: expected };
    }

    case 'tableau': {
      const expected = source.typeOptions?.tableChecked ?? [];
      if (expected.length === 0) return { ...base, correct: null };
      const given = new Set(answer.table);
      const correct = given.size === expected.length && expected.every((key) => given.has(key));
      return { ...base, correct, correctTable: expected };
    }

    case 'matching': {
      // ⚠️ Les paires ne sont JAMAIS filtrées : leur index est la clé que le
      // candidat renvoie (`answer.match`), et retirer une paire incomplète
      // décalerait toutes les suivantes — donc changerait la bonne réponse.
      const pairs = matchPairs(source.choices ?? []);
      if (!pairs.some((pair) => pair.right.length > 0)) return { ...base, correct: null };

      // ⚠️ **Comparaison EXACTE, et surtout pas `sameAnswerText`.** Ici le
      // candidat n'écrit rien : il relie deux encadrés. Le texte qu'il renvoie
      // n'est pas une réponse rédigée, c'est l'IDENTIFIANT de l'encadré qu'il a
      // touché — la colonne de droite lui est parvenue mélangée et sans index
      // d'origine (voir `ExerciseAnswer.match`), et il nous revient tel que nous
      // le lui avons envoyé, au caractère près. La tolérance de forme n'aurait
      // donc rien à rattraper : elle ne pourrait que faire accepter un encadré
      // DIFFÉRENT dont le libellé se normalise pareil (« Rhône » et « le
      // Rhône »), c'est-à-dire valider une erreur.
      const correct = pairs.every((pair, index) => {
        // Paire laissée à moitié écrite : il n'y a rien à relier, on ne la
        // compte pas contre le candidat (même règle que « pas de référence,
        // pas de verdict »).
        if (pair.right.length === 0) return true;
        return (answer.match[index] ?? '').trim() === pair.right;
      });
      return { ...base, correct, correctPairs: pairs };
    }

    default:
      // Réponse rédigée, dessin, dépôt de fichier, énoncé sans réponse : pas de
      // correction automatique possible, on affiche la réponse attendue.
      return { ...base, correct: null };
  }
}
