'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { QrCode, Settings, LogOut } from 'lucide-react';
import ShareQRModal from '@/components/ShareQRModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { leaveWorkshop } from '@/app/actions/workshops';
import ProgrammeTab from './tabs/ProgrammeTab';
import type { Chapter } from '@/app/actions/workshopChapters';
import ExamenTab from './tabs/ExamenTab';
import AnalyseTab from './tabs/AnalyseTab';
import CoursTab from './tabs/CoursTab';
import { palette, ink, withAlpha } from '@/lib/theme';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  createdAt: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'manager' | 'member';
  isPremium: boolean;
  members: { id: string; userId: string; role: 'owner' | 'manager' | 'member'; joinedAt: string; displayName: string; uniqueTag: string }[];
  chapters: Chapter[];
};

type TabId = 'programme' | 'examen' | 'analyse' | 'cours';

const TABS: { id: TabId; soon?: string }[] = [
  { id: 'programme' },
  { id: 'examen' },
  { id: 'analyse', soon: 'V2' },
  { id: 'cours', soon: 'V2' },
];

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'amber' | 'sage' | 'dim' }) {
  const styles = {
    default: { bg: withAlpha(palette.paper, 0.7), border: ink(0.08), color: palette.ink },
    amber: { bg: withAlpha(palette.amberGlow, 0.20), border: withAlpha(palette.amber, 0.30), color: '#7a4d20' },
    sage: { bg: withAlpha(palette.greenSoft, 0.18), border: withAlpha(palette.green, 0.30), color: '#3f5630' },
    dim: { bg: ink(0.06), border: ink(0.10), color: palette.inkMuted },
  }[tone];
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 999, background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function WorkshopClient({ locale, workshopId, workshopName, currentUserRole, isPremium, members, chapters }: Props) {
  const t = useTranslations('workshop');
  const router = useRouter();
  // Propriétaire ou gestionnaire : accès aux onglets de gestion + paramètres.
  const canManage = currentUserRole === 'owner' || currentUserRole === 'manager';
  const visibleTabs = canManage ? TABS : TABS.filter((t) => t.id === 'programme');
  const [activeTab, setActiveTab] = useState<TabId>('programme');

  const [shareOpen, setShareOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');

  // Quitter l'atelier — jamais pour le propriétaire (doit d'abord transférer/supprimer).
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  async function handleLeave() {
    setLeaving(true);
    setLeaveError('');
    const result = await leaveWorkshop(workshopId);
    if (result.success) {
      router.push(`/${locale}/dashboard`);
      return;
    }
    setLeaving(false);
    setLeaveError(result.error ?? t('leaveConfirm.error'));
  }

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/${locale}/dashboard?preview=${workshopId}`);
  }, [locale, workshopId]);

  return (
    <div style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", color: palette.ink, minHeight: 'calc(100vh - 65px)', background: palette.cream, display: 'flex', flexDirection: 'column' }}>
      {/* Google Fonts */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap');`}</style>

      {/* Workshop header */}
      <div style={{ paddingTop: 16, flexShrink: 0 }}>
        <div style={{ padding: '14px 24px 0' }}>
          {/* Breadcrumb */}
          <div style={{ fontSize: 11, color: palette.inkSoft, marginBottom: 10 }}>
            <Link href={`/${locale}/dashboard`} style={{ color: palette.inkSoft, textDecoration: 'none' }}>{t('breadcrumbGarden')}</Link>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: palette.ink }}>{workshopName.toLowerCase()}</span>
          </div>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: palette.ink, letterSpacing: '-0.015em' }}>{workshopName}</h1>
              {isPremium && <Chip tone="amber">{t('premiumBadge')}</Chip>}
              <Chip tone="dim">{t(`role.${currentUserRole}`)}</Chip>
              <span style={{ fontSize: 12, color: palette.inkSoft }}>
                {t('memberCount', { count: members.length, plural: members.length > 1 ? 's' : '' })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShareOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                <QrCode size={13} />
                {t('shareBtn')}
              </button>
              {canManage && (
                <Link href={`/${locale}/workshops/${workshopId}/settings`} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.inkMuted, fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Settings size={13} color="#5a564c" strokeWidth={1.75} />
                  {t('settingsLink')}
                </Link>
              )}
              {currentUserRole !== 'owner' && (
                <button onClick={() => setLeaveOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.danger, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <LogOut size={13} strokeWidth={1.75} />
                  {t('leaveBtn')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 26, padding: '14px 24px 0', borderBottom: `1px solid ${ink(0.08)}` }}>
          {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 0 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: activeTab === tab.id ? palette.ink : palette.inkSoft, fontWeight: activeTab === tab.id ? 500 : 400, borderBottom: activeTab === tab.id ? '2px solid #a87a3a' : '2px solid transparent', marginBottom: -1 }}>
              {t(`tabs.${tab.id}`)}
              {tab.soon && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 999, background: withAlpha(palette.amber, 0.18), color: '#7a4d20', fontWeight: 600, letterSpacing: '0.04em' }}>{tab.soon}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'programme' && <ProgrammeTab chapters={chapters} workshopId={workshopId} canManage={canManage} />}
        {canManage && activeTab === 'examen' && <ExamenTab workshopId={workshopId} />}
        {canManage && activeTab === 'analyse' && <AnalyseTab />}
        {canManage && activeTab === 'cours' && <CoursTab />}
      </div>

      {/* Share / QR modal */}
      <ShareQRModal open={shareOpen} onClose={() => setShareOpen(false)} title={workshopName} url={joinUrl} />

      {/* Quitter l'atelier — confirmation */}
      {leaveOpen && (
        <ConfirmDialog
          width={420}
          title={t('leaveConfirm.title')}
          description={
            <>
              {t('leaveConfirm.desc', { name: workshopName })}
              {leaveError && <div style={{ color: palette.danger, marginTop: 8 }}>{leaveError}</div>}
            </>
          }
          confirmLabel={leaving ? '…' : t('leaveConfirm.confirm')}
          cancelLabel={t('leaveConfirm.cancel')}
          onCancel={() => { if (!leaving) setLeaveOpen(false); }}
          onConfirm={handleLeave}
        />
      )}
    </div>
  );
}
