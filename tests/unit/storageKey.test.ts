// La clé de stockage d'un fichier d'atelier.
//
// Pourquoi ce test existe, alors qu'on ne teste presque rien (CLAUDE.md §7) :
// un nom de fichier est une **entrée non fiable** — il vient d'un utilisateur
// qui dépose un document, ou du nom que l'IA donne au cours qu'elle écrit — et
// le stockage refuse tout ce qui n'est pas de l'ASCII, d'un bloc et sans écrire
// un octet. L'échec est avalé plus haut (une ressource optionnelle n'a pas le
// droit de faire échouer une génération), donc **rien ne le signale** : le
// document de l'IA n'a jamais pu s'écrire pendant deux jours pour cette seule
// raison, son nom portant un « é » et une apostrophe typographique.
//
// Le jeu de caractères vérifié ici est celui du stockage, pas une préférence
// esthétique : y toucher, c'est rouvrir la panne.

import { describe, expect, it } from 'vitest';

import { buildWorkshopFileKey } from '@/lib/storage';

const WORKSHOP = '6d922bcc-b6e4-4396-a03c-04cfcd69a411';

/** Ce que le stockage accepte, et rien d'autre. */
const ACCEPTED = /^[A-Za-z0-9/._-]+$/;

describe('buildWorkshopFileKey — une clé que le stockage accepte', () => {
  it('translittère accents et apostrophes typographiques', () => {
    const key = buildWorkshopFileKey(WORKSHOP, 'Cours écrit par l’IA.md');
    expect(key).toMatch(ACCEPTED);
    expect(key).toContain('Cours-ecrit-par-l-IA.md');
  });

  it('accepte tout ce qu’un utilisateur peut déposer', () => {
    for (const name of ["Cours d'été.pdf", 'Chapitre 3 — partie 2.pdf', '中文.pdf', 'a  b.pdf']) {
      expect(buildWorkshopFileKey(WORKSHOP, name)).toMatch(ACCEPTED);
    }
  });

  it('range le fichier sous son atelier, précédé d’un horodatage', () => {
    expect(buildWorkshopFileKey(WORKSHOP, 'cours.pdf')).toMatch(
      new RegExp(`^${WORKSHOP}/\\d+-cours\\.pdf$`),
    );
  });

  it('rend une clé valide même d’un nom qui ne laisse aucun caractère', () => {
    // Sans ce filet, la clé finirait par un tiret suivi de rien : le stockage la
    // refuserait comme il refuse le reste, et pour un cas qu'on n'aurait pas vu.
    expect(buildWorkshopFileKey(WORKSHOP, '。。。')).toMatch(ACCEPTED);
  });
});
