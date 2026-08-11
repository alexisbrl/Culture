'use server';

import { assertManager, requireManager } from '@/lib/authz';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as examLib from '@/lib/workshops/exam';
import * as notionsLib from '@/lib/workshops/notions';
import * as chaptersLib from '@/lib/workshops/chapters';
import { buildWorkshopFileKey, createUploadTicket, deleteObject, type UploadTicket } from '@/lib/storage';
// Types de domaine (audit §5.3) : voir @/lib/workshops/examTypes — plus de
// dépendance vers des composants UI (QuestionEditor.tsx/ExamenTab.tsx).
// Redéclarés en alias locaux (un fichier `'use server'` ne peut pas réexporter
// un type importé, cf. @/app/actions/workshops pour le détail du piège Turbopack).
import type {
  Question, ExamPool as ExamPoolType, GeneratedExam as GeneratedExamType, ExamDraft as ExamDraftType,
} from '@/lib/workshops/examTypes';

// Notions proposées à l'association dans l'éditeur — toutes celles de l'atelier,
// sans restriction de chapitre. `chapterId` sert au filtre par chapitre de la
// banque : une question n'a pas de chapitre en propre (`chapter_id` est réservé
// au parcours), elle en hérite par les notions qui lui sont associées.
export type QuestionNotion = { id: string; title: string; chapterId: string | null };
export type QuestionChapter = { id: string; name: string };

export type ExamPool = ExamPoolType;
export type GeneratedExam = GeneratedExamType;
export type ExamDraft = ExamDraftType;

// ⚠️ SÉCURITÉ — Le générateur d'examen est réservé aux gestionnaires (CLAUDE.md §14),
// et la banque contient les RÉPONSES : aucune de ces actions ne doit être accessible
// à un candidat ni à un non-membre. Chaque action vérifie donc le rôle côté serveur
// via `requireManager`/`assertManager` (cf. src/lib/authz.ts) — ne jamais se fier au
// fait que l'onglet est masqué côté client. Logique métier : voir @/lib/workshops/exam.

export async function getExamBankData(workshopId: string): Promise<{
  questions: Question[];
  pools: ExamPool[];
  exams: GeneratedExam[];
  notions: QuestionNotion[];
  chapters: QuestionChapter[];
}> {
  // Lecture réservée aux gestionnaires (la banque contient les réponses).
  if (!(await requireManager(workshopId))) {
    return { questions: [], pools: [], exams: [], notions: [], chapters: [] };
  }

  // Trois domaines indépendants → en parallèle (règle N+1).
  const [data, notions, chapters] = await Promise.all([
    examLib.getExamBankData(workshopId),
    notionsLib.listNotions(workshopId),
    chaptersLib.listChapters(workshopId),
  ]);

  return {
    ...data,
    notions: notions.map((n) => ({ id: n.id, title: n.title, chapterId: n.chapterId })),
    chapters: chapters.map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function saveQuestion(workshopId: string, question: Question): Promise<void> {
  await assertManager(workshopId);
  await examLib.saveQuestion(workshopId, question);
  revalidateWorkshop();
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  await assertManager(workshopId);
  await examLib.saveQuestions(workshopId, questions);
  revalidateWorkshop();
}

export async function createPool(workshopId: string, pool: ExamPool): Promise<void> {
  await assertManager(workshopId);
  await examLib.createPool(workshopId, pool);
  revalidateWorkshop();
}

export async function updatePool(workshopId: string, pool: ExamPool): Promise<void> {
  await assertManager(workshopId);
  await examLib.updatePool(workshopId, pool);
  revalidateWorkshop();
}

export async function deletePool(workshopId: string, poolId: string, affectedQuestions: Question[]): Promise<void> {
  await assertManager(workshopId);
  await examLib.deletePool(workshopId, poolId, affectedQuestions);
  revalidateWorkshop();
}

export async function deleteQuestion(workshopId: string, questionId: string, affectedQuestions: Question[]): Promise<void> {
  await assertManager(workshopId);
  await examLib.deleteQuestion(workshopId, questionId, affectedQuestions);
  revalidateWorkshop();
}

export async function saveGeneratedExam(workshopId: string, exam: GeneratedExam): Promise<void> {
  await assertManager(workshopId);
  await examLib.saveGeneratedExam(workshopId, exam);
  revalidateWorkshop();
}

export async function getExamDraft(workshopId: string): Promise<ExamDraft | null> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return null;
  return await examLib.getExamDraft(workshopId, ctx.userId);
}

export async function deleteGeneratedExam(workshopId: string, examId: string): Promise<void> {
  await assertManager(workshopId);
  await examLib.deleteGeneratedExam(workshopId, examId);
  revalidateWorkshop();
}

export async function saveExamDraft(workshopId: string, draft: ExamDraft): Promise<void> {
  const ctx = await assertManager(workshopId);
  await examLib.saveExamDraft(workshopId, ctx.userId, draft);
}

// ─── Pièce jointe d'énoncé (image / audio) ───────────────────────────────────
//
// Même mécanique en deux temps que `workshopFiles.ts` (ticket signé → PUT
// direct par le client → la clé est enregistrée avec le reste de la question
// via `saveQuestion(s)`, pas d'appel de finalisation séparé : il n'y a pas de
// catalogue de fichiers à tenir à jour ici, juste une clé sur la question).

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

export async function createQuestionMediaUploadTicket(
  workshopId: string,
  kind: 'image' | 'audio',
  fileName: string,
  fileSize: number,
  mimeType: string
): Promise<{ success: boolean; ticket?: UploadTicket; key?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const allowedTypes = kind === 'image' ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES;
    const maxBytes = kind === 'image' ? IMAGE_MAX_BYTES : AUDIO_MAX_BYTES;
    if (!allowedTypes.includes(mimeType)) return { success: false, error: 'Format non supporté' };
    if (fileSize > maxBytes) return { success: false, error: 'Fichier trop lourd' };

    const key = buildWorkshopFileKey(workshopId, fileName);
    const ticket = await createUploadTicket(key, mimeType);
    if (!ticket) return { success: false, error: 'Erreur serveur' };

    return { success: true, ticket, key };
  } catch (err) {
    console.error('createQuestionMediaUploadTicket error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Résolution en lot pour l'affichage (bloc gestionnaire : banque + feuille A4) —
// voir `resolveMediaUrls` (règle N+1).
export async function getQuestionMediaUrls(workshopId: string, keys: string[]): Promise<Record<string, string>> {
  if (!(await requireManager(workshopId))) return {};
  return await examLib.resolveMediaUrls(keys);
}

// Suppression de l'objet de stockage (remplacement ou retrait d'une pièce
// jointe). La question elle-même est enregistrée séparément via saveQuestion —
// cet appel ne touche que le stockage.
export async function deleteQuestionMedia(workshopId: string, key: string): Promise<void> {
  if (!(await requireManager(workshopId))) return;
  await deleteObject(key);
}
