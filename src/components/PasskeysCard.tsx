'use client';

// Bloc « clés d'accès » de la page profil.
//
// L'écran de connexion est celui de Clerk (`<SignIn/>`) : il propose la clé
// d'accès tout seul dès que l'option est activée dans le tableau de bord Clerk.
// Ce qui manquait, c'est l'autre moitié — un endroit pour EN CRÉER une : la page
// profil est faite maison, sans `<UserProfile/>`, donc personne n'aurait jamais
// pu enregistrer sa première clé. D'où ce bloc : lister, ajouter, renommer,
// supprimer.
//
// Une clé d'accès ne se crée que sur un compte déjà ouvert (contrainte Clerk) :
// ce bloc n'a donc jamais à gérer d'inscription, seulement une session en cours.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import { isClerkRuntimeError } from '@clerk/nextjs/errors';
import type { PasskeyResource } from '@clerk/nextjs/types';
import { Check, KeyRound, PenLine, Plus, Trash2, X } from 'lucide-react';
import { palette, withAlpha, shadow } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import ConfirmDialog from '@/components/ConfirmDialog';

type Props = { locale: string };

export default function PasskeysCard({ locale }: Props) {
  const t = useTranslations('profile.passkeys');
  const { user } = useUser();

  const [passkeys, setPasskeys] = useState<PasskeyResource[]>([]);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PasskeyResource | null>(null);

  // `user.passkeys` est un tableau de ressources vivantes : on le recopie en
  // état pour pouvoir le rafraîchir après chaque ajout/renommage/suppression.
  useEffect(() => {
    setPasskeys(user?.passkeys ?? []);
  }, [user]);

  // WebAuthn n'existe pas partout (vieux navigateur, contexte non sécurisé) :
  // proposer un bouton qui ne peut qu'échouer serait pire que de l'expliquer.
  // Mesuré après montage — `window` n'existe pas au rendu serveur.
  useEffect(() => {
    setSupported(typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function');
  }, []);

  function refresh() {
    setPasskeys([...(user?.passkeys ?? [])]);
  }

  function reportError(err: unknown) {
    // Refuser l'invite du système n'est pas une erreur : c'est un choix.
    if (isClerkRuntimeError(err) && err.code === 'passkey_registration_cancelled') {
      setMessage({ tone: 'info', text: t('cancelled') });
      return;
    }
    setMessage({ tone: 'error', text: t('error') });
  }

  async function addPasskey() {
    if (!user || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await user.createPasskey();
      await user.reload();
      refresh();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveName(passkey: PasskeyResource) {
    const name = draftName.trim();
    setRenamingId(null);
    if (!name || name === passkey.name) return;
    setMessage(null);
    try {
      await passkey.update({ name });
      await user?.reload();
      refresh();
    } catch (err) {
      reportError(err);
    }
  }

  async function confirmDelete() {
    const passkey = pendingDelete;
    setPendingDelete(null);
    if (!passkey) return;
    setMessage(null);
    try {
      await passkey.delete();
      await user?.reload();
      refresh();
    } catch (err) {
      reportError(err);
    }
  }

  function formatDate(date: Date) {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  const cardStyle: React.CSSProperties = {
    background: palette.surfaceRaised,
    border: `1px solid ${palette.line}`,
    borderRadius: 16,
    boxShadow: shadow.sm,
  };

  const iconButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${palette.line}`,
    background: 'transparent',
    color: palette.inkSoft,
    cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: palette.inkMuted, margin: '26px 0 12px', textTransform: 'uppercase' }}>
        {t('sectionTitle')}
      </div>

      <div style={{ ...cardStyle, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.greenBrand, flexShrink: 0 }}>
            <KeyRound size={20} strokeWidth={1.75} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: palette.ink }}>{t('title')}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: palette.inkMuted, marginTop: 2 }}>{t('desc')}</span>
          </span>
        </div>

        {passkeys.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {passkeys.map((passkey) => {
              const isRenaming = renamingId === passkey.id;
              const name = passkey.name || t('defaultName');
              return (
                <li
                  key={passkey.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${palette.line}`,
                    background: palette.surfaceInput,
                  }}
                >
                  {isRenaming ? (
                    <>
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveName(passkey);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        aria-label={t('rename')}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: 'inherit',
                          fontSize: 14,
                          fontWeight: 600,
                          color: palette.ink,
                          background: palette.surfaceRaised,
                          border: `1px solid ${palette.lineStrong}`,
                          borderRadius: 8,
                          padding: '6px 10px',
                          outline: 'none',
                        }}
                      />
                      <Tooltip content={t('save')}>
                        <button type="button" aria-label={t('save')} onClick={() => void saveName(passkey)} style={{ ...iconButtonStyle, color: palette.greenBrand }}>
                          <Check size={15} strokeWidth={2} />
                        </button>
                      </Tooltip>
                      <Tooltip content={t('cancel')}>
                        <button type="button" aria-label={t('cancel')} onClick={() => setRenamingId(null)} style={iconButtonStyle}>
                          <X size={15} strokeWidth={2} />
                        </button>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: palette.inkFaint, marginTop: 2 }}>
                          {t('added', { date: formatDate(passkey.createdAt) })}
                          {' · '}
                          {passkey.lastUsedAt ? t('lastUsed', { date: formatDate(passkey.lastUsedAt) }) : t('neverUsed')}
                        </span>
                      </span>
                      <Tooltip content={t('rename')}>
                        <button
                          type="button"
                          aria-label={t('rename')}
                          onClick={() => {
                            setRenamingId(passkey.id);
                            setDraftName(passkey.name || '');
                          }}
                          style={iconButtonStyle}
                        >
                          <PenLine size={15} strokeWidth={1.75} />
                        </button>
                      </Tooltip>
                      <Tooltip content={t('delete')}>
                        <button
                          type="button"
                          aria-label={t('delete')}
                          onClick={() => setPendingDelete(passkey)}
                          style={{ ...iconButtonStyle, color: palette.danger, borderColor: withAlpha(palette.danger, 0.3) }}
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: palette.inkSoft, margin: '16px 0 0' }}>{t('empty')}</p>
        )}

        {message && (
          <p style={{ fontSize: 12.5, color: message.tone === 'error' ? palette.danger : palette.inkSoft, margin: '12px 0 0' }}>
            {message.text}
          </p>
        )}

        {supported ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void addPasskey()} disabled={busy} style={{ marginTop: 16 }}>
            <Plus size={15} strokeWidth={2} />
            {busy ? t('adding') : t('add')}
          </Button>
        ) : (
          <p style={{ fontSize: 12.5, color: palette.inkFaint, margin: '16px 0 0' }}>{t('unsupported')}</p>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          portal
          title={t('deleteTitle')}
          description={t('deleteDesc', { name: pendingDelete.name || t('defaultName') })}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          icon={<Trash2 size={22} strokeWidth={1.75} />}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
