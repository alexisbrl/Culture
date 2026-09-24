import { NextRequest, NextResponse } from 'next/server';

import { requireImportManager } from '@/lib/authz';
import { passFailed } from '@/lib/ingest/failure';
import * as run from '@/lib/ingest/run';
import { revalidateWorkshop } from '@/lib/revalidate';

// Les appels de la génération qui doivent partir EN PARALLÈLE : les notions
// d'un chapitre, un appel de questions d'entraînement, un appel de questions
// d'examen.
//
// ─── Pourquoi une route et non des server actions ────────────────────────────
//
// Le navigateur envoie les server actions **une par une** (Next.js le documente
// comme un détail d'implémentation). Lancés « en parallèle » par l'écran, vingt
// appels de questions s'exécutaient donc en file : 14 minutes au lieu d'une
// seule vague d'une minute (constaté le 24/09/2026). Une route d'API est un
// `fetch` ordinaire, qui ne passe par aucune file.
//
// Même contrat qu'une action : contrôle d'accès en tête — droits sur l'atelier
// ET lot de cet atelier —, logique dans @/lib/ingest/run, réponse
// `{ ok: true, … } | { ok: false, error }`.

type Body = {
  pass?: unknown;
  workshopId?: unknown;
  importId?: unknown;
  chapterId?: unknown;
  chapter?: unknown;
  batchIndex?: unknown;
  budgetShare?: unknown;
  startBudget?: unknown;
  slice?: unknown;
};

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const optionalNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
  }
  const { pass, workshopId, importId } = body;
  if (!isString(workshopId) || !isString(importId)) {
    return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
  }

  const ctx = await requireImportManager(workshopId, importId);
  if (!ctx) return NextResponse.json({ ok: false, error: 'Droits insuffisants' }, { status: 403 });

  if (pass === 'chapter-notions') {
    const { chapterId } = body;
    if (!isString(chapterId)) return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
    try {
      const result = await run.ingestChapterNotions(workshopId, ctx.userId, importId, chapterId);
      revalidateWorkshop();
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: passFailed('notions', error, { workshopId, importId, chapterId }) });
    }
  }

  if (pass === 'parcours-questions') {
    const chapter = body.chapter as { id?: unknown; name?: unknown } | null;
    if (!chapter || !isString(chapter.id) || typeof chapter.name !== 'string') {
      return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
    }
    const batchIndex = optionalNumber(body.batchIndex) ?? 0;
    try {
      const result = await run.ingestParcoursQuestions(
        workshopId,
        ctx.userId,
        importId,
        { id: chapter.id, name: chapter.name },
        batchIndex,
        { budgetShare: optionalNumber(body.budgetShare), startBudget: optionalNumber(body.startBudget) },
      );
      revalidateWorkshop();
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: passFailed('questions du parcours', error, { workshopId, importId, chapter: chapter.name, batchIndex }),
      });
    }
  }

  if (pass === 'exam-questions') {
    const slice = body.slice as { index?: unknown; count?: unknown; budget?: unknown; grouped?: unknown } | null;
    const index = optionalNumber(slice?.index);
    const count = optionalNumber(slice?.count);
    const budget = optionalNumber(slice?.budget);
    if (index === undefined || count === undefined || budget === undefined || typeof slice?.grouped !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
    }
    try {
      const result = await run.ingestExamQuestions(workshopId, ctx.userId, importId, { index, count, budget, grouped: slice.grouped });
      revalidateWorkshop();
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json({ ok: false, error: passFailed("questions d'examen", error, { workshopId, importId, sliceIndex: index }) });
    }
  }

  return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
}
