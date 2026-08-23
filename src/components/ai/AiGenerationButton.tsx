'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';

import { ink, palette, radius } from '@/lib/theme';

import AiGenerationDialog, { useWorkshopFiles } from './AiGenerationDialog';

// Le bouton « générer par IA », prêt à poser sur n'importe quel écran.
//
// Les Paramètres ont **deux portes sur la même fonction** — Ressources et
// Chapitre & Notion — et c'est voulu : on arrive à la génération soit par les
// documents, soit par le programme qu'ils alimentent. Le dialogue derrière est
// le même (§8 du plan d'ingestion), seules changent les cases cochées au départ.

type Props = {
  workshopId: string;
  /** Contexte imposé quand on entre par une liste de questions. Depuis les
   *  Paramètres, il n'y en a pas : l'utilisateur choisit dans le dialogue. */
  forcedContext?: 'parcours' | 'exam' | null;
  /** Rendu compact, pour se glisser dans une barre d'outils déjà chargée. */
  compact?: boolean;
  onDone?: () => void;
};

export default function AiGenerationButton({ workshopId, forcedContext = null, compact = false, onDone }: Props) {
  const t = useTranslations('ai');
  const [open, setOpen] = useState(false);
  // `open` en second argument : la liste est relue à chaque ouverture, donc un
  // document téléversé (ou supprimé) juste avant est pris en compte sans avoir à
  // recharger la page.
  const files = useWorkshopFiles(workshopId, open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: compact ? '5px 10px' : '7px 13px',
          borderRadius: radius.md,
          border: `1px solid ${ink(0.12)}`,
          background: palette.creamAlt,
          fontSize: compact ? 12.5 : 13.5,
          color: palette.inkMuted,
          cursor: 'pointer',
        }}
      >
        <Sparkles size={compact ? 13 : 15} color={palette.green} />
        {t('button')}
      </button>

      {open && (
        <AiGenerationDialog
          workshopId={workshopId}
          files={files ?? []}
          forcedContext={forcedContext}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}
