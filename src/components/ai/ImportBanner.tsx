'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Undo2 } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';
import { ink, palette, radius } from '@/lib/theme';
import { cancelWorkshopImport, getImportBanner, type ImportBanner as Banner } from '@/app/actions/aiIngest';

// Le bandeau d'annulation d'un import IA.
//
// ─── Pourquoi un bandeau, et pourquoi sur PLUSIEURS écrans ───────────────────
//
// Un import touche trois écrans à la fois (chapitres, notions, questions) :
// l'ancrer sur un seul le rendrait introuvable depuis les autres. Le bandeau
// naît donc là où on constate le résultat, sur chacun d'eux.
//
// Il disparaît de lui-même : le serveur ne le renvoie que si le lot est encore
// annulable — moins de 24 h, et rien de modifié depuis. Aucune commande
// destructrice ne traîne donc dans l'interface une fois le délai passé, et il
// n'y a pas d'état à purger côté client.
//
// (Une entrée dans les notifications viendra en plus le jour où la cloche
// cessera d'être un placeholder — voir §10 du plan d'ingestion. La notification
// est un bon canal de découverte, un mauvais canal d'action : la commande doit
// rester là où on voit le dégât.)

type Props = {
  workshopId: string;
  /** Remonté après une annulation réussie, pour que l'écran se rafraîchisse. */
  onCancelled?: () => void;
};

export default function ImportBanner({ workshopId, onCancelled }: Props) {
  const t = useTranslations('ai');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getImportBanner(workshopId)
      .then((b) => { if (!cancelled) setBanner(b); })
      // Le bandeau est un confort : son échec ne doit rien empêcher.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workshopId]);

  if (!banner) return null;

  async function cancel() {
    if (!banner) return;
    setBusy(true);
    setError(null);
    const result = await cancelWorkshopImport(workshopId, banner.importId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setBanner(null);
    onCancelled?.();
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', marginBottom: 14,
        borderRadius: radius.md, background: 'rgba(60,107,57,.07)', border: `1px solid ${ink(0.08)}`,
      }}
    >
      <Sparkles size={15} color={palette.green} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: palette.inkMuted, flex: 1, minWidth: 0 }}>
        {t('banner.text', { chapters: banner.chapters, notions: banner.notions, questions: banner.questions })}
      </span>

      {error && <span style={{ fontSize: 12.5, color: palette.amber }}>{error}</span>}

      <Tooltip content={t('cancellable')}>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: radius.sm,
            border: `1px solid ${ink(0.12)}`, background: palette.creamAlt,
            fontSize: 12.5, color: palette.inkMuted, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          <Undo2 size={13} />
          {busy ? t('banner.cancelling') : t('banner.cancel')}
        </button>
      </Tooltip>
    </div>
  );
}
