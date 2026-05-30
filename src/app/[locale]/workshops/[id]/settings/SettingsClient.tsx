'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, RotateCcw } from 'lucide-react';
import { requestDeletionCode, confirmDeletion } from '@/app/actions/workshops';

type Member = {
  id: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  displayName: string;
  uniqueTag: string;
};

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  currentUserRole: 'owner' | 'member';
  members: Member[];
};

type NavSection = 'general' | 'visibility' | 'members' | 'bricks' | 'premium' | 'danger';

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: 'general', label: 'Général' },
  { id: 'visibility', label: 'Visibilité & accès' },
  { id: 'members', label: 'Membres & rôles' },
  { id: 'bricks', label: 'Briques de connaissance' },
  { id: 'premium', label: 'Atelier Premium' },
  { id: 'danger', label: 'Zone de danger' },
];

const MOCK_BRICKS = [
  { section: '01', title: 'La membrane est une bicouche phospholipidique fluide', diff: 3, imp: 5 },
  { section: '01', title: 'Les protéines membranaires permettent le transport sélectif', diff: 5, imp: 5 },
  { section: '02', title: 'Le cytosquelette structure et déplace la cellule', diff: 4, imp: 4 },
  { section: '03', title: "La mitochondrie produit l'ATP par phosphorylation oxydative", diff: 7, imp: 6 },
  { section: '03', title: 'Le cycle de Krebs se déroule dans la matrice mitochondriale', diff: 8, imp: 6 },
];

function avatarGradient(name: string) {
  const hues = [220, 160, 30, 270, 190, 340, 80, 130];
  const idx = name.charCodeAt(0) % hues.length;
  const h = hues[idx];
  return `linear-gradient(135deg, hsl(${h},55%,62%), hsl(${(h + 40) % 360},60%,52%))`;
}

function DotRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: '#9a948a', width: 28 }}>{label}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i < value ? '#a87a3a' : 'rgba(45,42,36,0.12)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function SettingsClient({ locale, workshopId, workshopName, members }: Props) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<NavSection>('general');

  // Section refs for scroll
  const sectionRefs: Record<NavSection, React.RefObject<HTMLDivElement | null>> = {
    general: useRef<HTMLDivElement>(null),
    visibility: useRef<HTMLDivElement>(null),
    members: useRef<HTMLDivElement>(null),
    bricks: useRef<HTMLDivElement>(null),
    premium: useRef<HTMLDivElement>(null),
    danger: useRef<HTMLDivElement>(null),
  };

  function scrollTo(id: NavSection) {
    setActiveSection(id);
    sectionRefs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Section 1 — General
  const [workshopNameInput, setWorkshopNameInput] = useState(workshopName);

  // Section 2 — Visibility
  const [isPublic, setIsPublic] = useState(false);
  const [showProgramme, setShowProgramme] = useState(true);
  const [maxTotal, setMaxTotal] = useState('200');
  const [maxMonthly, setMaxMonthly] = useState('40');

  // Section 3 — Members
  const [tagInput, setTagInput] = useState('');
  const [localMembers, setLocalMembers] = useState<Member[]>(members);

  // Section 6 — Delete modal
  type DeleteStep = 'idle' | 'confirm' | 'sending' | 'enter_code' | 'verifying';
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');

  async function handleSendCode() {
    setDeleteStep('sending');
    setDeleteError('');
    const result = await requestDeletionCode(workshopId);
    if (result.success) setDeleteStep('enter_code');
    else {
      setDeleteError(result.error ?? 'Erreur');
      setDeleteStep('confirm');
    }
  }

  async function handleConfirmDeletion() {
    if (deleteCode.length !== 6) return;
    setDeleteStep('verifying');
    setDeleteError('');
    const result = await confirmDeletion(workshopId, deleteCode);
    if (result.success) router.push(`/${locale}/dashboard`);
    else {
      setDeleteError(result.error ?? 'Erreur');
      setDeleteStep('enter_code');
    }
  }

  // ─── Sub-components ───────────────────────────────────────────────────────

  function Row({
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
          borderBottom: noBorder ? 'none' : '1px solid rgba(45,42,36,0.06)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 450, color: '#2d2a24' }}>{label}</div>
          {hint && <div style={{ fontSize: 11.5, color: '#9a948a', marginTop: 2 }}>{hint}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {children}
        </div>
      </div>
    );
  }

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <div
        style={{
          display: 'flex',
          background: 'rgba(45,42,36,0.06)',
          borderRadius: 999,
          padding: 3,
          gap: 2,
        }}
      >
        {(['privé', 'public'] as const).map((opt) => {
          const active = (opt === 'public') === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt === 'public')}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                border: 'none',
                fontSize: 12,
                fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: active ? '#fff' : 'transparent',
                color: active ? '#2d2a24' : '#7a766d',
                boxShadow: active ? '0 1px 4px rgba(45,42,36,0.12)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          border: 'none',
          background: value ? '#7a9968' : 'rgba(45,42,36,0.14)',
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
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          }}
        />
      </button>
    );
  }

  function NumInput({
    value,
    onChange,
    suffix,
  }: {
    value: string;
    onChange: (v: string) => void;
    suffix: string;
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          style={{
            width: 90,
            textAlign: 'right',
            fontSize: 13,
            fontFamily: 'inherit',
            padding: '6px 10px',
            border: '1px solid rgba(45,42,36,0.14)',
            borderRadius: 9,
            outline: 'none',
            background: 'rgba(255,255,255,0.7)',
            color: '#2d2a24',
          }}
        />
        <span style={{ fontSize: 12, color: '#9a948a', whiteSpace: 'nowrap' }}>{suffix}</span>
      </div>
    );
  }

  function SmallBtn({
    children,
    tone = 'ghost',
    onClick,
  }: {
    children: React.ReactNode;
    tone?: 'ghost' | 'danger' | 'dark' | 'amber';
    onClick?: () => void;
  }) {
    const styles = {
      ghost: {
        bg: 'transparent',
        border: '1px solid rgba(45,42,36,0.16)',
        color: '#5a564c',
      },
      danger: {
        bg: 'rgba(184,90,74,0.10)',
        border: '1px solid rgba(184,90,74,0.30)',
        color: '#b85a4a',
      },
      dark: {
        bg: '#2d2a24',
        border: '1px solid #2d2a24',
        color: '#fff',
      },
      amber: {
        bg: '#a87a3a',
        border: '1px solid #a87a3a',
        color: '#fff',
      },
    }[tone];

    return (
      <button
        onClick={onClick}
        style={{
          padding: '7px 14px',
          borderRadius: 9,
          background: styles.bg,
          border: styles.border,
          color: styles.color,
          fontSize: 12.5,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 450,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </button>
    );
  }

  function SectionCard({
    id,
    title,
    description,
    children,
  }: {
    id: NavSection;
    title: string;
    description: string;
    children: React.ReactNode;
  }) {
    return (
      <div
        ref={sectionRefs[id]}
        id={id}
        style={{ marginBottom: 36, scrollMarginTop: 24 }}
      >
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24', marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: '#9a948a' }}>{description}</div>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 14,
            border: '1px solid rgba(45,42,36,0.07)',
            padding: '6px 18px',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Minimal SVG QR code placeholder
  function QRPlaceholder() {
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ borderRadius: 6, border: '1px solid rgba(45,42,36,0.10)' }}>
        <rect width="44" height="44" fill="#fff" />
        {/* Corner squares */}
        <rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="#2d2a24" strokeWidth="1.5" />
        <rect x="6" y="6" width="8" height="8" rx="1" fill="#2d2a24" />
        <rect x="28" y="4" width="12" height="12" rx="2" fill="none" stroke="#2d2a24" strokeWidth="1.5" />
        <rect x="30" y="6" width="8" height="8" rx="1" fill="#2d2a24" />
        <rect x="4" y="28" width="12" height="12" rx="2" fill="none" stroke="#2d2a24" strokeWidth="1.5" />
        <rect x="6" y="30" width="8" height="8" rx="1" fill="#2d2a24" />
        {/* Data dots */}
        {[20, 24, 28, 32, 36].map((x) =>
          [20, 24, 28, 32, 36].map((y) =>
            (x + y) % 8 === 0 ? <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#2d2a24" /> : null
          )
        )}
      </svg>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Inter Tight', system-ui, sans-serif",
        color: '#2d2a24',
        minHeight: '100vh',
        background: '#fcf9f2',
        display: 'flex',
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Caveat:wght@400;500;600&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <div
        style={{
          width: 232,
          flexShrink: 0,
          borderRight: '1px solid rgba(45,42,36,0.07)',
          background: 'rgba(252,249,242,0.6)',
          padding: '22px 16px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Back link */}
        <Link
          href={`/${locale}/workshops/${workshopId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: '#9a948a',
            textDecoration: 'none',
            marginBottom: 20,
          }}
        >
          ← {workshopName}
        </Link>

        {/* Label */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: '#b8b1a6',
            textTransform: 'uppercase',
            marginBottom: 8,
            paddingLeft: 10,
          }}
        >
          Paramètres
        </div>

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: 'none',
                  background: active ? 'rgba(168,122,58,0.14)' : 'transparent',
                  color: active ? '#7a4d20' : '#5a564c',
                  fontWeight: active ? 500 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'all 0.12s',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Main content ── */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '40px 32px 40px 40px',
          maxWidth: 760,
        }}
      >
        {/* ── 1. Général ── */}
        <SectionCard
          id="general"
          title="Général"
          description="Informations de base de l'atelier."
        >
          <Row label="Nom de l'atelier">
            <input
              type="text"
              value={workshopNameInput}
              onChange={(e) => setWorkshopNameInput(e.target.value)}
              style={{
                fontSize: 13,
                fontFamily: 'inherit',
                padding: '7px 12px',
                border: '1px solid rgba(45,42,36,0.14)',
                borderRadius: 9,
                outline: 'none',
                background: 'rgba(255,255,255,0.7)',
                color: '#2d2a24',
                width: 220,
              }}
            />
          </Row>

          <Row label="QR code" hint="redirige directement vers la page">
            <QRPlaceholder />
            <SmallBtn tone="ghost">télécharger</SmallBtn>
          </Row>

          <Row label="Source & cours" hint="gérer les fichiers et régénérer les briques" noBorder>
            <button
              onClick={() => scrollTo('bricks')}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 13,
                color: '#a87a3a',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(168,122,58,0.4)',
                padding: 0,
              }}
            >
              voir les briques →
            </button>
          </Row>
        </SectionCard>

        {/* ── 2. Visibilité & accès ── */}
        <SectionCard
          id="visibility"
          title="Visibilité & accès"
          description="Contrôlez qui peut accéder à votre atelier et comment."
        >
          <Row label="Visibilité" hint="un atelier privé se rejoint via tag ou invitation">
            <Toggle value={isPublic} onChange={setIsPublic} />
          </Row>

          <Row label="Afficher le programme éducatif">
            <Switch value={showProgramme} onChange={setShowProgramme} />
          </Row>

          <Row label="Nombre maximal de candidats (total)">
            <NumInput value={maxTotal} onChange={setMaxTotal} suffix="membres" />
          </Row>

          <Row label="Nombre maximal de candidats (mensuel)" noBorder>
            <NumInput value={maxMonthly} onChange={setMaxMonthly} suffix="/ mois" />
          </Row>
        </SectionCard>

        {/* ── 3. Membres & rôles ── */}
        <SectionCard
          id="members"
          title="Membres & rôles"
          description="Gérez les accès et les permissions des membres de l'atelier."
        >
          <Row label="Inviter un utilisateur" hint="par tag">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                placeholder="#tag…"
                style={{
                  fontSize: 13,
                  fontFamily: "'ui-monospace', 'monospace', inherit",
                  padding: '7px 12px',
                  border: '1px solid rgba(45,42,36,0.14)',
                  borderRadius: 9,
                  outline: 'none',
                  background: 'rgba(255,255,255,0.7)',
                  color: '#2d2a24',
                  width: 130,
                  letterSpacing: '0.04em',
                }}
              />
              <SmallBtn tone="dark">inviter</SmallBtn>
            </div>
          </Row>

          {/* Member list */}
          {localMembers.map((member, i) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom:
                  i < localMembers.length - 1 ? '1px solid rgba(45,42,36,0.06)' : 'none',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: avatarGradient(member.displayName),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {member.displayName.charAt(0).toUpperCase()}
              </div>

              {/* Name + role */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 450,
                    color: '#2d2a24',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {member.displayName}
                </div>
                <div style={{ fontSize: 11, color: '#9a948a' }}>
                  {member.role === 'owner' ? 'propriétaire' : 'membre'} · {member.uniqueTag}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {member.role !== 'owner' && (
                  <SmallBtn tone="ghost">promouvoir</SmallBtn>
                )}
                {member.role === 'member' && (
                  <SmallBtn tone="ghost">rétrograder</SmallBtn>
                )}
                {member.role !== 'owner' && (
                  <SmallBtn
                    tone="danger"
                    onClick={() =>
                      setLocalMembers((prev) => prev.filter((m) => m.id !== member.id))
                    }
                  >
                    virer
                  </SmallBtn>
                )}
              </div>
            </div>
          ))}
        </SectionCard>

        {/* ── 4. Briques de connaissance ── */}
        <SectionCard
          id="bricks"
          title="Briques de connaissance"
          description="Les unités d'information extraites de vos fichiers sources par l'IA."
        >
          <Row label="Fichiers source" noBorder={false}>
            <div style={{ display: 'flex', gap: 8 }}>
              <SmallBtn tone="ghost">gérer les fichiers</SmallBtn>
              <SmallBtn tone="dark">✦ régénérer par IA</SmallBtn>
            </div>
          </Row>

          {/* Bricks list */}
          <div style={{ marginTop: 4 }}>
            {MOCK_BRICKS.map((brick, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0',
                  borderBottom:
                    i < MOCK_BRICKS.length - 1 ? '1px solid rgba(45,42,36,0.06)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#b8b1a6',
                    fontFamily: 'ui-monospace, monospace',
                    width: 24,
                    flexShrink: 0,
                  }}
                >
                  {brick.section}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: '#2d2a24',
                      marginBottom: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {brick.title}
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <DotRow label="diff" value={brick.diff} max={10} />
                    <DotRow label="imp" value={brick.imp} max={10} />
                  </div>
                </div>
                <SmallBtn tone="ghost">éditer</SmallBtn>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12,
              borderTop: '1px solid rgba(45,42,36,0.06)',
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#9a948a' }}>5 sur 142 affichées</span>
            <SmallBtn tone="ghost">voir toutes les briques</SmallBtn>
          </div>
        </SectionCard>

        {/* ── 5. Atelier Premium ── */}
        <SectionCard
          id="premium"
          title="Atelier Premium"
          description="Activez le statut Premium pour débloquer des fonctionnalités avancées pour tous les membres."
        >
          <Row
            label="Passer l'atelier Premium"
            hint="badge visible · engagement irréversible"
            noBorder
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(232,184,108,0.20)',
                  border: '1px solid rgba(168,122,58,0.30)',
                  color: '#7a4d20',
                  letterSpacing: '0.02em',
                }}
              >
                badge premium
              </span>
              <SmallBtn tone="amber">activer →</SmallBtn>
            </div>
          </Row>
        </SectionCard>

        {/* ── 6. Zone de danger ── */}
        <SectionCard
          id="danger"
          title="Zone de danger"
          description="Actions irréversibles — procédez avec prudence."
        >
          <Row
            label="Supprimer l'atelier"
            hint="toutes les briques, examens et progressions seront perdus"
            noBorder
          >
            <SmallBtn tone="danger" onClick={() => setDeleteStep('confirm')}>
              supprimer l'atelier
            </SmallBtn>
          </Row>
        </SectionCard>
      </div>

      {/* ── Delete modal ── */}
      {deleteStep !== 'idle' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(45,42,36,0.5)',
            backdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              boxShadow: '0 30px 80px rgba(45,42,36,0.18)',
              padding: 24,
              width: '100%',
              maxWidth: 360,
              fontFamily: 'inherit',
            }}
          >
            {(deleteStep === 'confirm' || deleteStep === 'sending') && (
              <>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: 'rgba(184,90,74,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b85a4a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    color: '#2d2a24',
                    textAlign: 'center',
                    margin: '0 0 8px',
                  }}
                >
                  Mettre en corbeille ?
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: '#7a766d',
                    textAlign: 'center',
                    margin: '0 0 6px',
                  }}
                >
                  &quot;{workshopName}&quot; sera mis en corbeille. Vous aurez 7 jours pour annuler.
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: '#9a948a',
                    textAlign: 'center',
                    margin: '0 0 20px',
                  }}
                >
                  Un code de confirmation sera envoyé par email.
                </p>
                {deleteError && (
                  <p
                    style={{
                      fontSize: 12,
                      color: '#b85a4a',
                      background: 'rgba(184,90,74,0.08)',
                      padding: '8px 12px',
                      borderRadius: 9,
                      textAlign: 'center',
                      marginBottom: 14,
                    }}
                  >
                    {deleteError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setDeleteStep('idle')}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(45,42,36,0.14)',
                      background: 'transparent',
                      color: '#5a564c',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSendCode}
                    disabled={deleteStep === 'sending'}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#b85a4a',
                      color: '#fff',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity: deleteStep === 'sending' ? 0.6 : 1,
                    }}
                  >
                    {deleteStep === 'sending' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Envoi…
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        Envoyer le code
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {(deleteStep === 'enter_code' || deleteStep === 'verifying') && (
              <>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: 'rgba(232,184,108,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <Mail size={22} color="#c89860" />
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    color: '#2d2a24',
                    textAlign: 'center',
                    margin: '0 0 8px',
                  }}
                >
                  Code envoyé !
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: '#7a766d',
                    textAlign: 'center',
                    margin: '0 0 20px',
                  }}
                >
                  Saisissez le code à 6 chiffres reçu par email. Il expire dans 15 minutes.
                </p>
                <input
                  type="text"
                  value={deleteCode}
                  onChange={(e) => {
                    setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setDeleteError('');
                  }}
                  placeholder="000000"
                  maxLength={6}
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontSize: 28,
                    fontFamily: 'ui-monospace, monospace',
                    letterSpacing: '0.5em',
                    padding: '12px 16px',
                    border: '2px solid rgba(45,42,36,0.14)',
                    borderRadius: 12,
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: 10,
                  }}
                  disabled={deleteStep === 'verifying'}
                  autoFocus
                />
                {deleteError && (
                  <p
                    style={{
                      fontSize: 12,
                      color: '#b85a4a',
                      background: 'rgba(184,90,74,0.08)',
                      padding: '8px 12px',
                      borderRadius: 9,
                      textAlign: 'center',
                      marginBottom: 10,
                    }}
                  >
                    {deleteError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      setDeleteStep('confirm');
                      setDeleteCode('');
                      setDeleteError('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(45,42,36,0.14)',
                      background: 'transparent',
                      color: '#5a564c',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <RotateCcw size={13} />
                    Renvoyer
                  </button>
                  <button
                    onClick={handleConfirmDeletion}
                    disabled={deleteCode.length !== 6 || deleteStep === 'verifying'}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#b85a4a',
                      color: '#fff',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity:
                        deleteCode.length !== 6 || deleteStep === 'verifying' ? 0.5 : 1,
                    }}
                  >
                    {deleteStep === 'verifying' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Vérification…
                      </>
                    ) : (
                      'Confirmer'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
