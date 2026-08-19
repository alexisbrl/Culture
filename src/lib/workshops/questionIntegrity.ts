// Contrôles d'INTÉGRITÉ d'une question, avant écriture en base.
//
// ─── Ce que ce module fait, et ce qu'il ne fait surtout pas ──────────────────
//
// Deux familles de règles cohabitent sur une question, et les confondre serait
// une faute de conception (décision du 19/08/2026, voir
// docs/ai-ingestion-plan.md §11) :
//
//   • QUALITÉ PÉDAGOGIQUE — un QCM à une seule bonne réponse, un énoncé vide, un
//     niveau de Bloom mal choisi. Ce sont des choix légitimes de l'utilisateur :
//     s'il veut un QCM à une réponse, ce n'est pas une erreur. **Rien de tout
//     cela n'est vérifié ici.** La qualité s'obtient en orientant le modèle dans
//     le prompt, jamais en refusant d'enregistrer.
//
//   • INTÉGRITÉ STRUCTURELLE — une notion qui n'existe pas, une notion d'un
//     AUTRE atelier, un type de réponse inventé. Personne ne peut vouloir ça :
//     c'est de la corruption. **C'est le périmètre exact de ce module.**
//
// ─── Réparer ou rejeter ──────────────────────────────────────────────────────
//
// On répare ce qui a un mapping fondé, on rejette ce qui n'en a pas :
//
//   • Bloom 6 → 4, `sondage` → `qcm` : l'échelle a été réduite, le type a été
//     renommé. Le sens est préservé → réparation silencieuse (`toBloomLevel`,
//     `parseResponseType`).
//   • `vrai_faux` : aucun mapping fondé. Le replier sur `textuelle` produirait un
//     vrai/faux rendu en champ de texte libre, avec des propositions devenues
//     inutiles et une bonne réponse qui ne pointe sur rien — une question
//     SILENCIEUSEMENT FAUSSE, pire qu'une question absente → rejet.
//
// ─── Pourquoi un module à part, sans Supabase ────────────────────────────────
//
// La vérification est PURE : elle reçoit la question et l'ensemble des notions
// autorisées, elle renvoie la liste des manquements. L'appelant (`exam.ts`) fait
// la requête. C'est ce qui la rend testable sans double de client Supabase, et
// c'est ce qui permettra à l'ingestion IA de l'appeler en boucle sur 160
// questions avec UNE seule lecture des notions de l'atelier.

import { parseResponseType, type Question } from '@/lib/workshops/examTypes';

/** Toutes les notions référencées par un groupe — question principale et
 *  questions liées confondues, sans doublon. */
export function notionIdsOf(question: Question): string[] {
  const all = [
    ...(question.notionIds ?? []),
    ...(question.parts ?? []).flatMap((part) => part.notionIds ?? []),
  ];
  return [...new Set(all)];
}

/** Les manquements d'INTÉGRITÉ d'un groupe, en clair. Tableau vide = rien à
 *  redire — ce qui ne veut pas dire que la question est bonne, seulement qu'elle
 *  est cohérente (voir l'en-tête de ce fichier).
 *
 *  `allowedNotionIds` : les identifiants de notions de CET atelier. C'est ce
 *  paramètre qui ferme la porte au rattachement inter-ateliers — la clé
 *  étrangère, elle, ne le voit pas : elle vérifie que la notion existe, pas
 *  qu'elle est ici. */
export function questionIntegrityErrors(question: Question, allowedNotionIds: Set<string>): string[] {
  const errors: string[] = [];

  // 1. Types de réponse — la principale et chaque question liée.
  const types = [
    { label: 'la question', value: question.responseType },
    ...(question.parts ?? []).map((part, i) => ({ label: `la question liée ${i + 1}`, value: part.responseType })),
  ];
  for (const { label, value } of types) {
    if (parseResponseType(value) === null) {
      errors.push(`Type de réponse inconnu sur ${label} : « ${String(value)} »`);
    }
  }

  // 2. Notions — existantes ET de cet atelier. Les deux cas donnent le même
  //    message : de l'extérieur, une notion d'un autre atelier n'existe pas.
  const unknown = notionIdsOf(question).filter((id) => !allowedNotionIds.has(id));
  if (unknown.length > 0) {
    errors.push(
      unknown.length === 1
        ? `Notion introuvable dans cet atelier : ${unknown[0]}`
        : `${unknown.length} notions introuvables dans cet atelier : ${unknown.join(', ')}`,
    );
  }

  return errors;
}

/** Lève si le groupe n'est pas intègre. Message unique, lisible, qui liste TOUS
 *  les manquements d'un coup — corriger un problème pour en découvrir un autre
 *  au ré-enregistrement est une perte de temps, pour un humain comme pour une
 *  boucle d'ingestion. */
export function assertQuestionIntegrity(question: Question, allowedNotionIds: Set<string>): void {
  const errors = questionIntegrityErrors(question, allowedNotionIds);
  if (errors.length > 0) {
    throw new Error(`Question ${question.id} — ${errors.join(' · ')}`);
  }
}
