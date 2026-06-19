'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { QrCode, Settings } from 'lucide-react';
import ShareQRModal from '@/components/ShareQRModal';
import ProgrammeTab from './tabs/ProgrammeTab';
import ExamenTab from './tabs/ExamenTab';
import AnalyseTab from './tabs/AnalyseTab';
import CoursTab from './tabs/CoursTab';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  createdAt: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'member';
  members: { id: string; userId: string; role: 'owner' | 'member'; joinedAt: string; displayName: string; uniqueTag: string }[];
};

type TabId = 'programme' | 'examen' | 'analyse' | 'cours';

const TABS: { id: TabId; label: string; soon?: string }[] = [
  { id: 'programme', label: 'Programme éducatif' },
  { id: 'examen', label: "Génération d'examen" },
  { id: 'analyse', label: 'Analyse', soon: 'V2' },
  { id: 'cours', label: 'Génération de cours', soon: 'V2' },
];

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'amber' | 'sage' | 'dim' }) {
  const styles = {
    default: { bg: 'rgba(255,255,255,0.7)', border: 'rgba(45,42,36,0.08)', color: '#2d2a24' },
    amber: { bg: 'rgba(232,184,108,0.20)', border: 'rgba(168,122,58,0.30)', color: '#7a4d20' },
    sage: { bg: 'rgba(122,153,104,0.18)', border: 'rgba(79,107,64,0.30)', color: '#3f5630' },
    dim: { bg: 'rgba(45,42,36,0.06)', border: 'rgba(45,42,36,0.10)', color: '#5a564c' },
  }[tone];
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 999, background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function WorkshopClient({ locale, workshopId, workshopName, currentUserRole, members }: Props) {
  const isOwner = currentUserRole === 'owner';
  const [activeTab, setActiveTab] = useState<TabId>('programme');

  const [shareOpen, setShareOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/${locale}/dashboard?preview=${workshopId}`);
  }, [locale, workshopId]);

  return (
    <div style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", color: '#2d2a24', minHeight: 'calc(100vh - 65px)', background: '#fcf9f2', display: 'flex', flexDirection: 'column' }}>
      {/* Google Fonts */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap');`}</style>

      {/* Workshop header */}
      <div style={{ paddingTop: 16, flexShrink: 0 }}>
        <div style={{ padding: '14px 24px 0' }}>
          {/* Breadcrumb */}
          <div style={{ fontSize: 11, color: '#7a766d', marginBottom: 10 }}>
            <Link href={`/${locale}/dashboard`} style={{ color: '#7a766d', textDecoration: 'none' }}>jardin</Link>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: '#2d2a24' }}>{workshopName.toLowerCase()}</span>
          </div>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: '#2d2a24', letterSpacing: '-0.015em' }}>{workshopName}</h1>
              <Chip tone="amber">premium</Chip>
              <Chip tone="dim">{isOwner ? 'propriétaire' : 'membre'}</Chip>
              <span style={{ fontSize: 12, color: '#7a766d' }}>
                {members.length} membre{members.length > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShareOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                <QrCode size={13} />
                partager · QR
              </button>
              {isOwner && (
                <Link href={`/${locale}/workshops/${workshopId}/settings`} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Settings size={13} color="#5a564c" strokeWidth={1.75} />
                  paramètres
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 26, padding: '14px 24px 0', borderBottom: '1px solid rgba(45,42,36,0.08)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 0 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: activeTab === t.id ? '#2d2a24' : '#7a766d', fontWeight: activeTab === t.id ? 500 : 400, borderBottom: activeTab === t.id ? '2px solid #a87a3a' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
              {t.soon && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: 'rgba(168,122,58,0.18)', color: '#7a4d20', fontWeight: 600, letterSpacing: '0.04em' }}>{t.soon}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'programme' && <ProgrammeTab />}
        {activeTab === 'examen' && <ExamenTab workshopId={workshopId} />}
        {activeTab === 'analyse' && <AnalyseTab />}
        {activeTab === 'cours' && <CoursTab />}
      </div>

      {/* Share / QR modal */}
      <ShareQRModal open={shareOpen} onClose={() => setShareOpen(false)} title={workshopName} url={joinUrl} />
    </div>
  );
}
