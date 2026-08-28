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
// ─── …mais il n'annonce que ce qu'on a sous les yeux (28/08/2026) ────────────
//
// Un lot ne remplit jamais les deux destinations : le contexte des questions
// vient du bouton par lequel on est entré. Un bandeau qui annonçait un total
// unique affichait donc « 87 questions ajoutées » en tête de la liste du
// parcours alors que les 87 étaient parties à la banque d'examen — et
// inversement. D'où la portée : le programme (chapitres, notions, questions du
// parcours) d'un côté, la banque d'examen de l'autre. Un lot qui n'a rien
// apporté à l'écran courant n'y apparaît pas du tout.
//
// L'annulation, elle, reste **entière** : elle défait le lot complet, y compris
// ce que cet écran ne montre pas. C'est dit dans le bandeau plutôt que deviné.
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

/** Ce que l'écran hôte montre, donc ce que le bandeau a le droit d'annoncer.
 *  `programme` : chapitres, notions et questions du parcours (documents,
 *  notions, liste du parcours). `exam` : la banque de questions d'examen. */
export type ImportBannerScope = 'programme' | 'exam';

type Props = {
  workshopId: string;
  scope: ImportBannerScope;
  /** Remonté après une annulation réussie, pour que l'écran se rafraîchisse. */
  onCancelled?: () => void;
};

export default function ImportBanner({ workshopId, scope, onCancelled }: Props) {
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

  /** Les volumes du lot, rangés en « ce que cet écran montre » et « le reste,
   *  que l'annulation emportera quand même ». Les zéros sont écartés : un lot
   *  parti à l'examen n'a pas à annoncer « 0 question de parcours ». */
  function split(b: Banner) {
    const parcours = [
      { text: t('banner.chapters', { count: b.chapters }), count: b.chapters },
      { text: t('banner.notions', { count: b.notions }), count: b.notions },
      { text: t('banner.parcoursQuestions', { count: b.parcoursQuestions }), count: b.parcoursQuestions },
    ];
    const exam = [{ text: t('banner.examQuestions', { count: b.examQuestions }), count: b.examQuestions }];
    const [mine, other] = scope === 'exam' ? [exam, parcours] : [parcours, exam];
    const kept = (parts: typeof parcours) => parts.filter((p) => p.count > 0).map((p) => p.text);
    return { shown: kept(mine), hidden: kept(other) };
  }

  /** « a, b et c » — la conjonction est traduite, l'énumération non. */
  function join(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} ${t('banner.and')} ${parts[parts.length - 1]}`;
  }

  const visible = banners.filter((b) => split(b).shown.length > 0);
  if (visible.length === 0) return null;

  const [latest, ...previous] = visible;

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

  const row = (banner: Banner, main: boolean) => {
    const { shown, hidden } = split(banner);
    return (
    <div key={banner.importId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {main
        ? <Sparkles size={15} color={palette.green} style={{ flexShrink: 0 }} />
        : <span style={{ width: 15, flexShrink: 0 }} />}
      <span style={{ fontSize: main ? 13 : 12.5, color: main ? palette.inkMuted : palette.inkSoft, flex: 1, minWidth: 0 }}>
        {t('banner.text', { items: join(shown) })}
        {hidden.length > 0 && ` ${t('banner.alsoRemoves', { items: join(hidden) })}`}
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
  };

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
