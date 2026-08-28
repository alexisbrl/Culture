'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Sparkles, Undo2 } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';
import { ink, palette, radius } from '@/lib/theme';
import { cancelWorkshopImport, getImportBanners, type ImportBanner as Banner } from '@/app/actions/aiIngest';

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
  // ⚠️ **Une LISTE, pas un lot** (28/08/2026). Trois essais dans la même heure
  // laissaient deux lots annulables mais invisibles, donc perdus à l'expiration.
  const [banners, setBanners] = useState<Banner[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Les précédents restent repliés : le dernier import est celui qu'on vient de
  // faire, c'est presque toujours celui qu'on veut défaire.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getImportBanners(workshopId)
      .then((list) => { if (!cancelled) setBanners(list); })
      // Le bandeau est un confort : son échec ne doit rien empêcher.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workshopId]);

  if (banners.length === 0) return null;

  const [latest, ...previous] = banners;

  async function cancel(importId: string) {
    setBusy(importId);
    setError(null);
    const result = await cancelWorkshopImport(workshopId, importId);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    // Seul le lot annulé disparaît : les autres restent annulables, et leur
    // délai continue de courir.
    setBanners((list) => list.filter((b) => b.importId !== importId));
    onCancelled?.();
  }

  const row = (banner: Banner, main: boolean) => (
    <div key={banner.importId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {main
        ? <Sparkles size={15} color={palette.green} style={{ flexShrink: 0 }} />
        : <span style={{ width: 15, flexShrink: 0 }} />}
      <span style={{ fontSize: main ? 13 : 12.5, color: main ? palette.inkMuted : palette.inkSoft, flex: 1, minWidth: 0 }}>
        {t('banner.text', { chapters: banner.chapters, notions: banner.notions, questions: banner.questions })}
      </span>

      <Tooltip content={t('cancellable')}>
        <button
          type="button"
          onClick={() => cancel(banner.importId)}
          disabled={busy !== null}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: radius.sm,
            border: `1px solid ${ink(0.12)}`, background: palette.creamAlt,
            fontSize: 12.5, color: palette.inkMuted, cursor: busy !== null ? 'wait' : 'pointer',
          }}
        >
          <Undo2 size={13} />
          {busy === banner.importId ? t('banner.cancelling') : t('banner.cancel')}
        </button>
      </Tooltip>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '10px 14px', marginBottom: 14,
        borderRadius: radius.md, background: 'rgba(60,107,57,.07)', border: `1px solid ${ink(0.08)}`,
      }}
    >
      {row(latest, true)}

      {error && <span style={{ fontSize: 12.5, color: palette.amber }}>{error}</span>}

      {/* Les imports plus anciens, encore dans les 24 h. Repliés par défaut :
          annoncés d'une ligne, dépliés à la demande. */}
      {previous.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
              padding: 0, border: 'none', background: 'transparent',
              fontSize: 12.5, color: palette.inkSoft, cursor: 'pointer',
            }}
          >
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {t('banner.previous', { count: previous.length })}
          </button>
          {open && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
              {previous.map((banner) => row(banner, false))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
