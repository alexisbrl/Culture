'use client';

// Pièce jointe d'énoncé (image / audio) — isolé dans son propre fichier,
// sans dépendance vers QuestionEditor.tsx ni examShared.tsx : ces deux
// fichiers s'importent mutuellement (examShared relit les types de
// QuestionEditor), et un import de MediaAttachment/QuestionImagePreview
// depuis l'un d'eux créait un cycle que Turbopack dev refuse de résoudre
// (« Export MediaAttachment doesn't exist in target module ») alors que le
// build de production le tolérait par chance. examShared.tsx réexporte ce
// module pour ne pas casser ses consommateurs existants (GeneratorContent).

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AudioLines, Loader2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { palette } from '@/lib/theme';
import type { QuestionMedia } from '@/lib/workshops/examTypes';
import { createQuestionMediaUploadTicket, getQuestionMediaUrls } from '@/app/actions/examQuestions';

// Le modèle ne stocke qu'une clé de stockage (jamais une URL — voir
// `src/lib/storage.ts`) : l'URL signée se résout à la demande, côté serveur,
// via `getQuestionMediaUrls`. Un cache mémoire (process du navigateur, pas
// persisté) évite de re-résoudre la même clé quand une question s'affiche à
// plusieurs endroits à la fois (banque + feuille A4).
const mediaUrlCache = new Map<string, Promise<string | null>>();

function resolveMediaUrl(workshopId: string, key: string): Promise<string | null> {
  const cacheKey = `${workshopId}:${key}`;
  let pending = mediaUrlCache.get(cacheKey);
  if (!pending) {
    pending = getQuestionMediaUrls(workshopId, [key]).then((urls) => urls[key] ?? null);
    mediaUrlCache.set(cacheKey, pending);
  }
  return pending;
}

/** Résout la clé de stockage d'une pièce jointe en URL affichable. `null` tant
 *  que non résolue ou si `media` est absent. */
export function useQuestionMediaUrl(workshopId: string, media: QuestionMedia | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = media?.key ?? null;

  useEffect(() => {
    if (!key) { setUrl(null); return; }
    let cancelled = false;
    resolveMediaUrl(workshopId, key).then((resolved) => { if (!cancelled) setUrl(resolved); });
    return () => { cancelled = true; };
  }, [workshopId, key]);

  return url;
}

/** Upload direct d'une pièce jointe : demande un ticket signé, PUT direct vers
 *  le stockage (le serveur ne voit jamais les octets du fichier), puis renvoie
 *  la clé à enregistrer sur la question via `saveQuestion`. */
export async function uploadQuestionMedia(
  workshopId: string,
  kind: 'image' | 'audio',
  file: File
): Promise<{ key: string } | { error: string }> {
  const ticketRes = await createQuestionMediaUploadTicket(workshopId, kind, file.name, file.size, file.type);
  if (!ticketRes.success || !ticketRes.ticket || !ticketRes.key) {
    return { error: ticketRes.error ?? 'Erreur serveur' };
  }

  const putRes = await fetch(ticketRes.ticket.url, {
    method: ticketRes.ticket.method,
    headers: ticketRes.ticket.headers,
    body: file,
  });
  if (!putRes.ok) return { error: 'Échec du téléchargement' };

  return { key: ticketRes.key };
}

function classifyDroppedFile(file: File): 'image' | 'audio' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

/** Glisser-déposer un fichier n'importe où sur la carte d'édition d'une
 *  question : reconnu automatiquement comme image ou audio et rangé au bon
 *  endroit, sinon message d'erreur. À étaler sur le conteneur racine de
 *  l'éditeur (`InlineQuestionEditor`/`QuestionEditor`) via `dropHandlers`. */
export function useQuestionMediaDrop(
  workshopId: string,
  onAttach: (kind: 'image' | 'audio', media: QuestionMedia) => void
) {
  const t = useTranslations('examen');
  const [dragOver, setDragOver] = useState(false);
  const [dropError, setDropError] = useState('');

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      // Un `dragleave` se déclenche aussi en survolant un enfant : on ne
      // désactive le surlignage qu'en quittant réellement la carte.
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDragOver(false);
    },
    onDrop: async (e: React.DragEvent) => {
      if (!e.dataTransfer.files?.length) return;
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      const kind = classifyDroppedFile(file);
      if (!kind) { setDropError(t('inline.unsupportedFormat')); return; }
      setDropError('');
      const res = await uploadQuestionMedia(workshopId, kind, file);
      if ('error' in res) { setDropError(res.error); return; }
      onAttach(kind, { key: res.key });
    },
  };

  return { dragOver, dropError, dropHandlers };
}

const mediaButtonStyle = (uploading: boolean): React.CSSProperties => ({
  width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, borderRadius: 8,
  color: uploading ? palette.inkFaint : palette.inkMuted, cursor: uploading ? 'wait' : 'pointer',
});

/** Lecteur audio compact de l'éditeur : un simple carré avec un bouton play
 *  tant que rien ne joue (au repos comme en pause), qui se déplie en barre de
 *  contrôles pendant la lecture. Pas de piste de progression ni de minuteur —
 *  hors de propos pour une pièce jointe d'énoncé courte. Le retrait (croix)
 *  est toujours visible, dans les deux états — même geste que pour l'image. */
function AudioAttachment({ workshopId, media, onRemove }: {
  workshopId: string;
  media: QuestionMedia;
  onRemove: () => void;
}) {
  const t = useTranslations('examen');
  const url = useQuestionMediaUrl(workshopId, media);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause(); else el.play().catch(() => {});
  }
  function skip(deltaSeconds: number) {
    const el = audioRef.current;
    if (!el) return;
    const duration = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.max(0, Math.min(duration, el.currentTime + deltaSeconds));
  }
  function toggleMute() {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  const audioEl = (
    <audio
      ref={audioRef}
      src={url ?? undefined}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
    />
  );

  // Bouton retrait — même croix nue que celle de l'image, jamais le menu ⋮.
  const removeButton = (
    <button type="button" onClick={onRemove} title={t('inline.removeMedia')} style={{ flex: 'none', border: 'none', background: 'transparent', color: palette.inkFaint, cursor: 'pointer', padding: 2, display: 'flex' }}>
      <X size={14} strokeWidth={2.2} />
    </button>
  );

  if (!playing) {
    return (
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
        {audioEl}
        <button type="button" onClick={togglePlay} disabled={!url} title={t('inline.play')} style={mediaButtonStyle(false)}>
          <Play size={16} strokeWidth={1.75} fill={palette.inkMuted} color={palette.inkMuted} />
        </button>
        {removeButton}
      </div>
    );
  }

  // Barre dépliée : un seul encadré (bordure + fond) portant tous les
  // contrôles — pause, avance/recul, volume et retrait — plutôt que le
  // bouton pause isolé dans son propre carré avec le reste flottant à côté.
  const controlBtnStyle: React.CSSProperties = { border: 'none', background: 'transparent', color: palette.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3 };
  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, height: 38, padding: '0 8px', border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, borderRadius: 8 }}>
      {audioEl}
      <button type="button" onClick={togglePlay} title={t('inline.pause')} style={controlBtnStyle}>
        <Pause size={16} strokeWidth={1.75} fill={palette.inkMuted} color={palette.inkMuted} />
      </button>
      <button type="button" onClick={() => skip(-10)} title={t('inline.skipBack')} style={{ ...controlBtnStyle, fontSize: 10.5, fontWeight: 600 }}>
        -10s
      </button>
      <button type="button" onClick={() => skip(10)} title={t('inline.skipForward')} style={{ ...controlBtnStyle, fontSize: 10.5, fontWeight: 600 }}>
        +10s
      </button>
      <button type="button" onClick={toggleMute} title={t('inline.volume')} style={controlBtnStyle}>
        {muted ? <VolumeX size={15} strokeWidth={1.75} /> : <Volume2 size={15} strokeWidth={1.75} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          if (audioRef.current) audioRef.current.volume = v;
        }}
        style={{ width: 48 }}
      />
      <button type="button" onClick={onRemove} title={t('inline.removeMedia')} style={{ ...controlBtnStyle, color: palette.inkFaint }}>
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/** Pièce jointe d'énoncé (image ou audio), utilisée par `InlineQuestionEditor`
 *  et le popup `QuestionEditor` : bouton d'ajout tant qu'aucun fichier n'est
 *  attaché, aperçu + retrait une fois attaché. */
export function MediaAttachment({ workshopId, kind, media, onChange, label, icon }: {
  workshopId: string;
  kind: 'image' | 'audio';
  media: QuestionMedia | null | undefined;
  onChange: (media: QuestionMedia | null) => void;
  label: string;
  icon: React.ReactNode;
}) {
  const t = useTranslations('examen');
  const url = useQuestionMediaUrl(workshopId, media);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError('');
    const res = await uploadQuestionMedia(workshopId, kind, file);
    setUploading(false);
    if ('error' in res) { setError(res.error); return; }
    onChange({ key: res.key });
  }

  if (media) {
    if (kind === 'audio') {
      return <AudioAttachment workshopId={workshopId} media={media} onRemove={() => onChange(null)} />;
    }
    return (
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier privé (URL signée éphémère), pas un asset next/image
            <img src={url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 8, border: `1px solid ${palette.lineStrong}` }} />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised }} />
          )}
          <button type="button" onClick={() => onChange(null)} title={t('inline.removeMedia')} style={{ flex: 'none', border: 'none', background: 'transparent', color: palette.inkFaint, cursor: 'pointer', padding: 2, display: 'flex' }}>
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
        {error && <span style={{ fontSize: 11, color: palette.danger }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <input
        ref={inputRef}
        type="file"
        accept={kind === 'image' ? 'image/*' : 'audio/*'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} title={label} style={mediaButtonStyle(uploading)}>
        {uploading ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      </button>
      {error && <span style={{ fontSize: 11, color: palette.danger }}>{error}</span>}
    </div>
  );
}

/** Image d'énoncé, en lecture seule — feuille A4 (GeneratorContent) et tout
 *  endroit qui affiche une question déjà enregistrée sans l'éditer. Placée
 *  au-dessus du texte de la question. Ni largeur ni hauteur forcées : le
 *  ratio intrinsèque de l'image pilote l'affichage (`maxWidth`/`maxHeight`
 *  bornent la taille sans jamais déformer), et le conteneur n'est
 *  volontairement PAS un flex (l'étirement `align-items: stretch` d'un flex
 *  en colonne forçait la largeur de l'`<img>` et la déformait). */
export function QuestionImagePreview({ workshopId, image }: {
  workshopId: string;
  image?: QuestionMedia | null;
}) {
  const imageUrl = useQuestionMediaUrl(workshopId, image);
  if (!image || !imageUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier privé (URL signée éphémère), pas un asset next/image
    <img
      src={imageUrl}
      alt=""
      style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: 320, maxHeight: 260, objectFit: 'contain', borderRadius: 8, border: `1px solid ${palette.line}`, marginBottom: 10 }}
    />
  );
}

/** Note d'audio d'énoncé, en lecture seule — feuille A4 uniquement. L'examen
 *  est imprimé : un lecteur n'a pas de sens ici, seul un repère visuel
 *  indique qu'un enregistrement accompagne la question. Un vrai lecteur est
 *  prévu pour le passage en ligne, sous un design séparé (pas celui-ci). */
export function QuestionAudioNote({ audio }: { audio?: QuestionMedia | null }) {
  const t = useTranslations('examen');
  if (!audio) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12.5, color: palette.inkMuted }}>
      <AudioLines size={16} strokeWidth={1.75} color={palette.inkFaint} />
      {t('answerSpace.audioNote')}
    </div>
  );
}
