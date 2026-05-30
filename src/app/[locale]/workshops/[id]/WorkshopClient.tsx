'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, RotateCcw, Trash2 } from 'lucide-react';
import { requestDeletionCode, confirmDeletion } from '@/app/actions/workshops';
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
  { id: 'analyse', label: 'Analyse' },
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
  const router = useRouter();
  const isOwner = currentUserRole === 'owner';
  const [activeTab, setActiveTab] = useState<TabId>('programme');

  type DeleteStep = 'idle' | 'confirm' | 'sending' | 'enter_code' | 'verifying';
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');

  async function handleSendCode() {
    setDeleteStep('sending');
    setDeleteError('');
    const result = await requestDeletionCode(workshopId);
    if (result.success) setDeleteStep('enter_code');
    else { setDeleteError(result.error ?? 'Erreur'); setDeleteStep('confirm'); }
  }

  async function handleConfirmDeletion() {
    if (deleteCode.length !== 6) return;
    setDeleteStep('verifying');
    setDeleteError('');
    const result = await confirmDeletion(workshopId, deleteCode);
    if (result.success) router.push(`/${locale}/dashboard`);
    else { setDeleteError(result.error ?? 'Erreur'); setDeleteStep('enter_code'); }
  }

  return (
    <div style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", color: '#2d2a24', minHeight: '100vh', background: '#fcf9f2', display: 'flex', flexDirection: 'column' }}>
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
              <button style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>partager · QR</button>
              {isOwner && (
                <>
                  <Link href={`/${locale}/workshops/${workshopId}/settings`} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.4" stroke="#5a564c" strokeWidth="1.3" fill="none"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6L11 11M11 3L9.6 4.4M4.4 9.6L3 11" stroke="#5a564c" strokeWidth="1.1" strokeLinecap="round"/></svg>
                    paramètres
                  </Link>
                  <button onClick={() => setDeleteStep('confirm')} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(184,90,74,0.30)', color: '#b85a4a', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={13} />
                    supprimer
                  </button>
                </>
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
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'programme' && <ProgrammeTab />}
        {activeTab === 'examen' && <ExamenTab />}
        {activeTab === 'analyse' && <AnalyseTab />}
        {activeTab === 'cours' && <CoursTab />}
      </div>

      {/* Delete modal */}
      {deleteStep !== 'idle' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,42,36,0.5)', backdropFilter: 'blur(4px)', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 30px 80px rgba(45,42,36,0.18)', padding: 24, width: '100%', maxWidth: 360, fontFamily: 'inherit' }}>

            {(deleteStep === 'confirm' || deleteStep === 'sending') && (
              <>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(184,90,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Trash2 size={22} color="#b85a4a" />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24', textAlign: 'center', margin: '0 0 8px' }}>Mettre en corbeille ?</h3>
                <p style={{ fontSize: 13, color: '#7a766d', textAlign: 'center', margin: '0 0 6px' }}>&quot;{workshopName}&quot; sera mis en corbeille. Vous aurez 7 jours pour annuler.</p>
                <p style={{ fontSize: 11.5, color: '#9a948a', textAlign: 'center', margin: '0 0 20px' }}>Un code de confirmation sera envoyé par email.</p>
                {deleteError && <p style={{ fontSize: 12, color: '#b85a4a', background: 'rgba(184,90,74,0.08)', padding: '8px 12px', borderRadius: 9, textAlign: 'center', marginBottom: 14 }}>{deleteError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setDeleteStep('idle')} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                  <button onClick={handleSendCode} disabled={deleteStep === 'sending'} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#b85a4a', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: deleteStep === 'sending' ? 0.6 : 1 }}>
                    {deleteStep === 'sending' ? <><Loader2 size={14} className="animate-spin" />Envoi...</> : <><Mail size={14} />Envoyer le code</>}
                  </button>
                </div>
              </>
            )}

            {(deleteStep === 'enter_code' || deleteStep === 'verifying') && (
              <>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(232,184,108,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Mail size={22} color="#c89860" />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24', textAlign: 'center', margin: '0 0 8px' }}>Code envoyé !</h3>
                <p style={{ fontSize: 13, color: '#7a766d', textAlign: 'center', margin: '0 0 20px' }}>Saisissez le code à 6 chiffres reçu par email. Il expire dans 15 minutes.</p>
                <input type="text" value={deleteCode} onChange={e => { setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setDeleteError(''); }} placeholder="000000" maxLength={6} style={{ width: '100%', textAlign: 'center', fontSize: 28, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.5em', padding: '12px 16px', border: '2px solid rgba(45,42,36,0.14)', borderRadius: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} disabled={deleteStep === 'verifying'} autoFocus />
                {deleteError && <p style={{ fontSize: 12, color: '#b85a4a', background: 'rgba(184,90,74,0.08)', padding: '8px 12px', borderRadius: 9, textAlign: 'center', marginBottom: 10 }}>{deleteError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setDeleteStep('confirm'); setDeleteCode(''); setDeleteError(''); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <RotateCcw size={13} /> Renvoyer
                  </button>
                  <button onClick={handleConfirmDeletion} disabled={deleteCode.length !== 6 || deleteStep === 'verifying'} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#b85a4a', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: deleteCode.length !== 6 || deleteStep === 'verifying' ? 0.5 : 1 }}>
                    {deleteStep === 'verifying' ? <><Loader2 size={14} className="animate-spin" />Vérification...</> : 'Confirmer'}
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
