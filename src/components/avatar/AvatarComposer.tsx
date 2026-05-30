'use client';

import { AvatarConfig, FrameKey, FRAMES, SKIN_COLOR, placePart } from './avatarConfig';

// Z order: back → front (neck inserted between top et face)
const Z_ORDER = ['top', 'neck', 'face', 'brow', 'eyes', 'nose', 'mouth', 'hair'] as const;

type Props = {
  config: AvatarConfig;
  size?: number;
  frame?: FrameKey;
  style?: React.CSSProperties;
};

// Cou — trapèze qui plonge dans le vêtement avec un dégradé
const NECK = {
  centerX:     340,
  topY:        390,
  bottomY:     472,
  widthTop:     96,   // plus large
  widthBottom: 108,   // plus large
};

export default function AvatarComposer({ config, size = 140, frame = 'bust', style }: Props) {
  const crop = FRAMES[frame];
  const scale = size / crop.s;
  const skinColor = SKIN_COLOR[config.face] ?? '#f2c8a0';

  // ID unique pour le gradient SVG (évite les conflits si plusieurs instances)
  const gradId = `neck-grad-${size}-${frame}`;

  const layers = Z_ORDER.map((cat) => {

    // Cou SVG — seulement en frame bust
    if (cat === 'neck') {
      if (frame !== 'bust') return null;

      const cx  = NECK.centerX;
      const ty  = NECK.topY;
      const by  = NECK.bottomY;
      const s   = scale;
      const ox  = crop.x;
      const oy  = crop.y;

      const x1 = (cx - NECK.widthTop    / 2 - ox) * s;
      const x2 = (cx + NECK.widthTop    / 2 - ox) * s;
      const x3 = (cx + NECK.widthBottom / 2 - ox) * s;
      const x4 = (cx - NECK.widthBottom / 2 - ox) * s;
      const yt  = (ty - oy) * s;
      const yb  = (by - oy) * s;

      return (
        <svg
          key="neck"
          style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible' }}
          aria-hidden
        >
          <defs>
            {/* Dégradé vertical : peau opaque en haut → transparent en bas
                L'effet : le cou "rentre" dans le col du vêtement sans coupure nette */}
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={skinColor} stopOpacity="1"   />
              <stop offset="50%"  stopColor={skinColor} stopOpacity="1"   />
              <stop offset="78%"  stopColor={skinColor} stopOpacity="0.5" />
              <stop offset="100%" stopColor={skinColor} stopOpacity="0"   />
            </linearGradient>
          </defs>
          <polygon
            points={`${x1},${yt} ${x2},${yt} ${x3},${yb} ${x4},${yb}`}
            fill={`url(#${gradId})`}
          />
        </svg>
      );
    }

    const id = config[cat as keyof AvatarConfig];
    if (!id) return null;

    const p = placePart(cat, id, frame);
    if (!p) return null;

    const left = (p.left - crop.x) * scale;
    const top  = (p.top  - crop.y) * scale;
    const w    = p.w * scale;

    // <img> natif avec height:auto — identique au prototype
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        key={cat}
        src={`/avatar/${id}.png`}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: 'auto',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    );
  });

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      overflow: 'hidden',
      flexShrink: 0,
      ...style,
    }}>
      {layers}
    </div>
  );
}
