import { NextRequest, NextResponse } from 'next/server';

import { requireManager } from '@/lib/authz';
import { getSupabaseServerClient } from '@/lib/supabase';
import { discardTrash } from '@/lib/workshops/trash';

// Efface les copies de suppression d'une page des paramètres qu'on quitte
// (voir @/lib/workshops/trash et l'historique d'annulation de SettingsClient).
//
// Une route d'API et non une server action : l'appel part au moment où la page
// se ferme, par `navigator.sendBeacon` — le seul envoi que le navigateur mène à
// terme même quand l'onglet disparaît. Personne n'attend la réponse.
//
// ⚠️ URL publique comme une autre : `requireManager` en tête, l'identité vient
// de Clerk (le cookie part avec la balise), jamais du corps de la requête.

export async function POST(req: NextRequest) {
  try {
    const { workshopId, trashIds } = await req.json();
    if (typeof workshopId !== 'string' || !Array.isArray(trashIds)) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    if (!(await requireManager(workshopId))) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    await discardTrash(getSupabaseServerClient(), workshopId, trashIds.filter((id): id is string => typeof id === 'string').slice(0, 1000));
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Ménage seulement : la purge des copies de plus d'un jour rattrapera.
    console.error('[settings-trash] effacement impossible :', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
