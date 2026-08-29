import { NextRequest, NextResponse } from 'next/server';

import { requireMember } from '@/lib/authz';
import { refillChapter } from '@/lib/ingest/refill';

// Recharge automatique d'un chapitre — déclenchée par l'écran d'exercice, une
// fois la première question affichée, et **jamais attendue**.
//
// ─── Pourquoi une route et non une server action ─────────────────────────────
//
// Deux tentatives ont échoué avant celle-ci, et toutes deux pour la même
// raison : la recharge dure jusqu'à deux minutes, et tout ce qui la porte finit
// par retenir autre chose (29/08/2026).
//
//   1. `after()` accroché au tirage — ne détache la tâche que là où l'hébergeur
//      sait le faire. En développement, la réponse du tirage attendait la fin de
//      la génération : deux minutes de « tirage d'une question… ».
//   2. Une SERVER ACTION appelée sans être attendue — les appels d'actions
//      partis d'un même onglet sont mis à la queue leu leu par le routeur, parce
//      que chacun peut invalider le cache et re-rendre la page. Une recharge de
//      deux minutes bloquait donc le tirage suivant, la correction, et tout ce
//      que l'écran demande ensuite.
//
// Une route d'API est un `fetch` ordinaire : elle ne passe par aucune file, ne
// revalide rien, et n'a aucun effet sur le rendu. C'est exactement ce qu'on veut
// d'une tâche de fond tant qu'il n'existe pas de vraie file d'attente côté
// serveur (voir docs/backlog.md).
//
// ⚠️ **Le contrôle d'accès est ici comme ailleurs.** Une route d'API est une URL
// publique au même titre qu'une server action : `requireMember` en tête, et
// l'identité vient de Clerk, jamais du corps de la requête — sans quoi
// n'importe qui pourrait faire dépenser des appels au modèle sur l'atelier de
// n'importe qui d'autre.
//
// Les garde-fous de la dépense (plafond de 60 questions, délai de garde de 10
// minutes par chapitre, lot tracé et annulable) restent dans
// @/lib/ingest/refill : l'écran n'est qu'un déclencheur, pas une autorité.

export async function POST(req: NextRequest) {
  try {
    const { workshopId, chapterId } = await req.json();
    if (typeof workshopId !== 'string' || typeof chapterId !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const ctx = await requireMember(workshopId);
    if (!ctx) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const outcome = await refillChapter(workshopId, chapterId, ctx.userId);
    return NextResponse.json(outcome);
  } catch (error) {
    // `refillChapter` ne lève jamais : ce qui arrive ici est un corps de requête
    // illisible ou une panne d'authentification. Personne n'attend la réponse,
    // donc la trace serveur est tout ce qui reste.
    console.error('[parcours] recharge impossible :', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
