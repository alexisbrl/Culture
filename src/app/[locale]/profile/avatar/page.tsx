'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AvatarComposer from '@/components/avatar/AvatarComposer';
import { AvatarConfig, CATS, DEFAULT_CONFIG, loadAvatarConfig, saveAvatarConfig } from '@/components/avatar/avatarConfig';

export default function AvatarEditorPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'fr';

  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_CONFIG);
  const [activeCat, setActiveCat] = useState<keyof AvatarConfig>('face');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setConfig(loadAvatarConfig());
    setMounted(true);
  }, []);

  function pick(partId: string) {
    setConfig(prev => ({ ...prev, [activeCat]: partId }));
  }

  function validate() {
    saveAvatarConfig(config);
    router.push(`/${locale}/profile`);
  }

  const catDef = CATS.find(c => c.key === activeCat)!;

  return (
    <div style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", background: '#fcf9f2', minHeight: '100vh', padding: '24px 40px 40px', color: '#2d2a24' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap');`}</style>

      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: '#9a948a', marginBottom: 10 }}>
          <a href={`/${locale}/profile`} style={{ color: '#7a766d', textDecoration: 'none' }}>profil</a>
          <span style={{ margin: '0 7px', color: '#c2bba8' }}>›</span>
          <span style={{ color: '#5a564c' }}>éditer l&apos;avatar</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 500, letterSpacing: '-0.015em' }}>personnalise ton jardinier</h2>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 18, color: '#a87a3a' }}>« assemble ton personnage »</span>
        </div>
        <div style={{ fontSize: 13, color: '#7a766d', marginBottom: 22 }}>chaque élément se combine librement aux autres. ton choix s&apos;aperçoit en direct.</div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>

          {/* COLONNE GAUCHE */}
          <div style={{ background: 'linear-gradient(180deg, #f6f2eb, #ece6db)', border: '1px solid rgba(45,42,36,0.07)', borderRadius: 20, padding: '26px 26px 22px' }}>
            {/* Disque preview */}
            <div style={{
              position: 'relative', width: 320, height: 320, margin: '0 auto',
              borderRadius: '50%',
              background: 'radial-gradient(120% 120% at 50% 18%, #f4efe2 0%, #e6ecdc 55%, #d6e2cd 100%)',
              boxShadow: 'inset 0 2px 10px rgba(45,42,36,0.06), 0 14px 34px rgba(45,42,36,0.10)',
              overflow: 'hidden',
              border: '1px solid rgba(45,42,36,0.06)',
            }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, background: 'linear-gradient(180deg, rgba(168,184,150,0) 0%, rgba(168,184,150,0.45) 100%)' }} />
              <div style={{ position: 'absolute', left: '50%', bottom: 34, transform: 'translateX(-50%)', width: 150, height: 20, borderRadius: '50%', background: 'rgba(45,42,36,0.14)', filter: 'blur(7px)' }} />
              {mounted && (
                <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)' }}>
                  <AvatarComposer config={config} size={330} frame="bust" />
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <div style={{ fontFamily: "'Caveat', cursive", fontSize: 17, color: '#a87a3a' }}>« aperçu en direct »</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
              <button onClick={validate} style={{ padding: '12px 18px', borderRadius: 11, background: '#4f6b40', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', boxShadow: '0 8px 20px rgba(79,107,64,0.30)' }}>
                valider l&apos;avatar →
              </button>
              <a href={`/${locale}/profile`} style={{ padding: '12px 18px', borderRadius: 11, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                annuler
              </a>
            </div>
          </div>

          {/* COLONNE DROITE */}
          <div style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(45,42,36,0.07)', borderRadius: 20, padding: '20px 22px 24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              {CATS.map(c => (
                <button key={c.key} onClick={() => setActiveCat(c.key)} style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: activeCat === c.key ? 500 : 400, border: activeCat === c.key ? '1px solid transparent' : '1px solid rgba(45,42,36,0.12)', background: activeCat === c.key ? '#4f6b40' : 'rgba(255,255,255,0.6)', color: activeCat === c.key ? '#f4f0e6' : '#5a564c', boxShadow: activeCat === c.key ? '0 4px 12px rgba(79,107,64,0.26)' : 'none', transition: 'all .15s ease' }}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(45,42,36,0.07)', margin: '14px 0 16px' }} />

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{catDef.label}</div>
              <div style={{ fontSize: 12, color: '#9a948a', fontStyle: 'italic' }}>{catDef.hint}</div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {catDef.parts.map(partId => {
                const isActive = config[activeCat] === partId;

                return (
                  <button
                    key={partId}
                    onClick={() => pick(partId)}
                    style={{
                      position: 'relative', padding: 0, cursor: 'pointer',
                      width: 130, height: 130, borderRadius: 16,
                      border: `2px solid ${isActive ? '#a87a3a' : 'rgba(45,42,36,0.08)'}`,
                      background: isActive
                        ? 'radial-gradient(120% 120% at 50% 20%, #faf5e8, #eef0dd)'
                        : 'radial-gradient(120% 120% at 50% 20%, #fbf9f3, #f1efe7)',
                      boxShadow: isActive ? '0 8px 20px rgba(168,122,58,0.20)' : '0 2px 8px rgba(45,42,36,0.05)',
                      overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .15s ease',
                    }}
                  >
                    {/* Affiche uniquement le PNG de l'élément, centré */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/avatar/${partId}.png`}
                      alt={partId}
                      draggable={false}
                      style={{
                        maxWidth: '82%',
                        maxHeight: '82%',
                        objectFit: 'contain',
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                    />
                    {isActive && (
                      <span style={{
                        position: 'absolute', top: 7, right: 7,
                        width: 20, height: 20, borderRadius: '50%',
                        background: '#a87a3a', color: '#fff', fontSize: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(168,122,58,0.4)', zIndex: 2,
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
