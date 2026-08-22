import { describe, expect, it, vi } from 'vitest';

import { releaseDocuments } from '@/lib/ingest/release';
import type { PlanProvider, PreparedDocument } from '@/lib/ingest/providers/types';

// Les fichiers de la Files API ne s'effacent JAMAIS tout seuls (§16.8) : sans
// cet appel, chaque ingestion, chaque nouvel essai et chaque import annulé
// laissent leurs PDF chez le fournisseur, indéfiniment.
//
// Et surtout : un ménage raté ne doit jamais faire échouer ce qu'il accompagne.
// Une annulation qui remonterait une erreur parce qu'un fichier distant n'a pas
// pu être effacé serait absurde — le lot, lui, a bien été retiré.

const doc = (ref: string): PreparedDocument => ({
  key: `cours/${ref}.pdf`,
  fileName: `${ref}.pdf`,
  mimeType: 'application/pdf',
  ref,
});

/** Fournisseur factice : il note les poignées qu'on lui demande d'effacer. */
function releasingProvider(behaviour: 'ok' | 'throws' = 'ok') {
  const released: string[][] = [];
  const provider: Pick<PlanProvider, 'release'> = {
    async release(documents) {
      released.push(documents.map((d) => d.ref));
      if (behaviour === 'throws') throw new Error('403 chez le fournisseur');
    },
  };
  return { provider, released };
}

describe('releaseDocuments — rendre les documents au fournisseur', () => {
  it('transmet exactement les poignées du lot', async () => {
    const { provider, released } = releasingProvider();
    const ok = await releaseDocuments(provider, [doc('file_a'), doc('file_b')]);
    expect(ok).toBe(true);
    expect(released).toEqual([['file_a', 'file_b']]);
  });

  it('n’appelle pas le fournisseur pour un lot vide', async () => {
    const { provider, released } = releasingProvider();
    expect(await releaseDocuments(provider, [])).toBe(true);
    expect(released).toEqual([]);
  });

  it('une exception du fournisseur ne remonte pas', async () => {
    // Le cœur du sujet : ni l'annulation ni l'import ne doivent tomber pour ça.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider, released } = releasingProvider('throws');

    await expect(releaseDocuments(provider, [doc('file_a')])).resolves.toBe(false);

    // La tentative a bien eu lieu, et l'échec est journalisé plutôt que tu.
    expect(released).toEqual([['file_a']]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('les deux moments où les documents sont rendus', () => {
  it('à l’annulation d’un import, avec les poignées de ce lot', async () => {
    const { provider, released } = releasingProvider();
    const lot = [doc('file_1'), doc('file_2')];
    await releaseDocuments(provider, lot);
    expect(released[0]).toEqual(['file_1', 'file_2']);
  });

  it('en fin d’import réussi — dès que la passe notions est terminée', async () => {
    // La passe questions ne reçoit plus les documents (T3) : rien n'attend la
    // fin des questions pour faire le ménage.
    const { provider, released } = releasingProvider();
    const lot = [doc('file_1')];

    await releaseDocuments(provider, lot); // fin de la passe notions
    expect(released).toHaveLength(1);
    expect(released[0]).toEqual(['file_1']);
  });
});
