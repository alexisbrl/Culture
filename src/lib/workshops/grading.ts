// Correction d'un énoncé d'exercice : ce qui juge une réponse, et rien d'autre.
//
// Module PUR, sans Supabase — c'est la condition pour qu'il soit testé. La
// réponse d'un candidat est une entrée non fiable (elle arrive par une server
// action, donc par une URL POST publique) et le verdict décide d'un crédit de
// maîtrise : c'est exactement le genre de fonction que la discipline de tests du
// projet demande de couvrir. Extrait de `exam.ts` le 25/08/2026, en même temps
// que l'ouverture de la correction à la liste, au tableau et aux paires.

import { isListCorrect, sameAnswerText } from '@/lib/workshops/answerMatch';
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
 *  ─── Trancher, ou seulement confirmer ──────────────────────────────────────
 *
 *  Deux familles, et la différence n'est pas une question de zèle :
 *
 *  • **Ce qui se CHOISIT** — QCM, tableau, paires — porte une réponse juste
 *    connue sans ambiguïté : la machine tranche dans les deux sens, juste ou
 *    faux. La LISTE s'y rattache : sa référence est close (l'auteur a écrit
 *    toutes les réponses qu'il attend, et le candidat en donne autant).
 *  • **Ce qui s'ÉCRIT librement** — la réponse rédigée — ne peut être que
 *    CONFIRMÉE. Correspondre à la référence prouve qu'on a raison ; ne pas y
 *    correspondre ne prouve rien, une bonne réponse formulée autrement ne lui
 *    ressemble pas. Verdict `null`, jamais « faux ».
 *
 *  Jusqu'au 25/08/2026, seul le QCM était jugé : tout le reste s'affichait, se
 *  remplissait, et ressortait « pas de correction automatique » — donc sans
 *  jamais créditer la moindre progression (le crédit de maîtrise ne suit qu'un
 *  `correct === true`). C'est ce qui bornait en pratique la génération par IA au
 *  QCM.
 *
 *  Le dessin et le dépôt de fichier restent à `null` : il n'y a rien à comparer.
 *  `sans_reponse` aussi — l'énoncé ne fait qu'afficher.
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

    case 'textuelle': {
      // ⚠️ **Une réponse rédigée ne peut être que CONFIRMÉE, jamais réfutée.**
      //
      // Si le candidat écrit la réponse attendue — à la casse, aux accents, à la
      // ponctuation et à l'article près —, il a raison, on peut le dire et
      // créditer la notion. C'est le cas des réponses courtes et factuelles, et
      // ça n'était pas fait jusqu'au 25/08/2026 : elles ressortaient toutes sans
      // verdict, donc sans progression.
      //
      // S'il écrit autre chose, on ne sait RIEN : une bonne réponse formulée
      // autrement ne ressemble pas à la référence, et la machine ne peut pas les
      // départager. Le verdict reste donc `null` — la réponse attendue s'affiche
      // et le candidat se juge, exactement comme avant. Ce sont ces réponses-là
      // qui iront à la relecture par IA le jour où elle existera (docs/backlog.md) :
      // l'appel n'a de sens que sur ce dont on est incapable de trancher.
      const expected = (source.answer ?? '').trim();
      if (!expected) return { ...base, correct: null };
      return { ...base, correct: sameAnswerText(answer.text, expected) ? true : null };
    }

    default:
      // Dessin, dépôt de fichier, énoncé sans réponse : rien à comparer, on
      // affiche la réponse attendue.
      return { ...base, correct: null };
  }
}
