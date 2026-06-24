'use client';

import { palette, ink } from '@/lib/theme';

import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Check, Copy, Download, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
};

export default function ShareQRModal({ open, onClose, title, url }: Props) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!open) return null;

  async function handleCopyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    link.download = `qr-${slug || 'atelier'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ink(0.5), backdropFilter: 'blur(4px)', padding: 16 }} onClick={onClose}>
      <div style={{ background: palette.paper, borderRadius: 20, boxShadow: `0 30px 80px ${ink(0.18)}`, padding: 24, width: '100%', maxWidth: 360, fontFamily: 'inherit', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: palette.inkFaint, padding: 4, display: 'flex' }}>
          <X size={16} />
        </button>

        <h3 style={{ fontSize: 17, fontWeight: 500, color: palette.ink, textAlign: 'center', margin: '0 0 4px' }}>Rejoindre &quot;{title}&quot;</h3>
        <p style={{ fontSize: 12.5, color: palette.inkSoft, textAlign: 'center', margin: '0 0 20px' }}>Scannez ce QR code ou partagez le lien ci-dessous.</p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ padding: 14, background: palette.paper, borderRadius: 14, border: `1px solid ${ink(0.10)}` }}>
            {url && <QRCodeCanvas ref={canvasRef} value={url} size={180} bgColor="#ffffff" fgColor="#2d2a24" level="M" />}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: '10px 12px', border: `1px solid ${ink(0.14)}`, borderRadius: 10, outline: 'none', background: ink(0.03), color: palette.inkMuted }} />
          <button onClick={handleCopyLink} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, background: copied ? palette.greenSoft : palette.ink, color: palette.paper, border: 'none', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {copied ? <><Check size={13} />copié</> : <><Copy size={13} />copier</>}
          </button>
          <button onClick={handleDownload} aria-label="télécharger le QR code" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', borderRadius: 10, background: 'transparent', color: palette.inkMuted, border: `1px solid ${ink(0.14)}`, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
