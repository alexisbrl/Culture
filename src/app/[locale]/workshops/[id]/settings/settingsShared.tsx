'use client';

// Boîte à outils partagée des Paramètres d'atelier : types/constantes de rôle,
// helpers de présentation (Row, Switch, SmallBtn, SectionCard…) réutilisés par
// SettingsClient et ses sections (Général/Membres/Fichiers/Notions/Premium).
import { palette, withAlpha, shadow } from '@/lib/theme';
import { FileText, LayoutGrid, Music, SlidersHorizontal, Star, Users, type LucideIcon, File as FileIcon } from 'lucide-react';
import type { FileCategory } from '@/app/actions/workshopFiles';

export type WorkshopRole = 'owner' | 'manager' | 'member';

export type Member = {
  id: string;
  userId: string;
  role: WorkshopRole;
  joinedAt: string;
  displayName: string;
  uniqueTag: string;
  groupIds: string[];
};

export type NavSection = 'general' | 'members' | 'notions' | 'files' | 'premium';

export const NAV_ITEMS: { id: NavSection; icon: LucideIcon }[] = [
  { id: 'general', icon: SlidersHorizontal },
  { id: 'members', icon: Users },
  { id: 'files', icon: FileText },
  { id: 'notions', icon: LayoutGrid },
  { id: 'premium', icon: Star },
];

export const ROLE_RANK: Record<WorkshopRole, number> = { owner: 3, manager: 2, member: 1 };
export const ROLE_LABEL: Record<WorkshopRole, string> = { owner: 'propriétaire', manager: 'gestionnaire', member: 'membre' };

export function FileCategoryIcon({ category }: { category: FileCategory }) {
  const props = { size: 18, style: { color: palette.amber, flexShrink: 0 } };
  if (category === 'audio') return <Music {...props} />;
  if (category === 'texte') return <FileText {...props} />;
  return <FileIcon {...props} />;
}

// les unités sont passées par l'appelant (traduites via next-intl) ; défaut FR pour compat.
export function formatFileSize(bytes: number, units: { b: string; kb: string; mb: string } = { b: 'o', kb: 'Ko', mb: 'Mo' }): string {
  if (bytes < 1024) return `${bytes} ${units.b}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${units.kb}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${units.mb}`;
}

export function avatarGradient(name: string) {
  const hues = [220, 160, 30, 270, 190, 340, 80, 130];
  const idx = name.charCodeAt(0) % hues.length;
  const h = hues[idx];
  return `linear-gradient(135deg, hsl(${h},55%,62%), hsl(${(h + 40) % 360},60%,52%))`;
}

// ─── Sub-components ───────────────────────────────────────────────────────

export function Row({
  label,
  hint,
  children,
  noBorder,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderBottom: noBorder ? 'none' : `1px solid ${palette.line}`,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: palette.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: palette.inkFaint, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

export function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: 'none',
        background: value ? palette.green : palette.lineStrong,
        cursor: 'pointer',
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start',
        transition: 'all 0.18s',
        flexShrink: 0,
      }}
      aria-checked={value}
      role="switch"
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: palette.surfaceInput,
          boxShadow: shadow.sm,
        }}
      />
    </button>
  );
}

export function SmallBtn({
  children,
  tone = 'ghost',
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  tone?: 'ghost' | 'danger' | 'dark' | 'amber';
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles = {
    ghost: {
      bg: 'transparent',
      border: `1px solid ${palette.lineStrong}`,
      color: palette.inkMuted,
    },
    danger: {
      bg: withAlpha(palette.danger, 0.10),
      border: `1px solid ${withAlpha(palette.danger, 0.30)}`,
      color: palette.danger,
    },
    dark: {
      bg: palette.ink,
      border: `1px solid ${palette.ink}`,
      color: palette.onInk,
    },
    amber: {
      bg: palette.amber,
      border: `1px solid ${palette.amberLight}`,
      color: palette.onInk,
    },
  }[tone];

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: '9px 14px',
        borderRadius: 9,
        background: disabled ? palette.surfaceSunken : styles.bg,
        border: disabled ? `1px solid ${palette.line}` : styles.border,
        color: disabled ? palette.inkFaint : styles.color,
        fontSize: 12.5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        fontWeight: 450,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </button>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: palette.inkFaint }}>{description}</div>
      </div>
      <div
        style={{
          background: palette.surfaceRaised,
          borderRadius: 14,
          border: `1px solid ${palette.line}`,
          padding: '6px 18px',
        }}
      >
        {children}
      </div>
    </div>
  );
}
