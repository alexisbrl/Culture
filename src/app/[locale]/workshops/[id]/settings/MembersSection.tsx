'use client';

import { useState, useEffect } from 'react';
import { Mail, UserPlus } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import {
  inviteMemberByTag, getWorkshopInvitations, cancelInvitation, setMemberRole, removeMember,
  getJoinRequests, approveJoinRequest, rejectJoinRequest, type PendingInvite,
} from '@/app/actions/workshops';
import { ROLE_RANK, ROLE_LABEL, avatarGradient, Row, SmallBtn, SectionCard, type Member, type WorkshopRole } from './settingsShared';

export default function MembersSection({ workshopId, isPremium, currentUserRole, members }: { workshopId: string; isPremium: boolean; currentUserRole: WorkshopRole; members: Member[] }) {
  const actorRank = ROLE_RANK[currentUserRole];
  const [tagInput, setTagInput] = useState('');
  const [localMembers, setLocalMembers] = useState<Member[]>(members);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [cancelingInvite, setCancelingInvite] = useState<string | null>(null);

  // Demandes d'adhésion en attente (valables pour TOUS les ateliers, pas seulement Premium).
  const [joinRequests, setJoinRequests] = useState<PendingInvite[]>([]);
  const [joinReqActionId, setJoinReqActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPremium) return;
    getWorkshopInvitations(workshopId).then(setPendingInvites).catch(console.error);
  }, [isPremium, workshopId]);

  useEffect(() => {
    getJoinRequests(workshopId).then(setJoinRequests).catch(console.error);
  }, [workshopId]);

  async function handleApproveJoinRequest(targetUserId: string) {
    setJoinReqActionId(targetUserId);
    const result = await approveJoinRequest(workshopId, targetUserId);
    setJoinReqActionId(null);
    if (!result.success) return;
    const approved = joinRequests.find((r) => r.userId === targetUserId);
    setJoinRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
    if (approved) {
      setLocalMembers((prev) => [
        ...prev,
        {
          id: `req-${targetUserId}`,
          userId: targetUserId,
          role: 'member',
          joinedAt: new Date().toISOString(),
          displayName: approved.displayName,
          uniqueTag: approved.uniqueTag,
        },
      ]);
    }
  }

  async function handleRejectJoinRequest(targetUserId: string) {
    setJoinReqActionId(targetUserId);
    const result = await rejectJoinRequest(workshopId, targetUserId);
    setJoinReqActionId(null);
    if (result.success) {
      setJoinRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
    }
  }

  async function handleInvite() {
    const tag = tagInput.trim();
    if (!tag || inviting) return;
    setInviting(true);
    setInviteMsg(null);
    const result = await inviteMemberByTag(workshopId, tag);
    setInviting(false);
    if (result.success) {
      setInviteMsg({ type: 'success', text: `Invitation envoyée à ${result.displayName ?? tag}.` });
      setTagInput('');
      getWorkshopInvitations(workshopId).then(setPendingInvites).catch(console.error);
    } else {
      setInviteMsg({ type: 'error', text: result.error ?? 'Erreur lors de l’envoi' });
    }
  }

  async function handleCancelInvite(targetUserId: string) {
    setCancelingInvite(targetUserId);
    const result = await cancelInvitation(workshopId, targetUserId);
    setCancelingInvite(null);
    if (result.success) {
      setPendingInvites((prev) => prev.filter((p) => p.userId !== targetUserId));
    }
  }

  // ── Gestion des rôles / exclusion (règles de rang appliquées côté serveur) ──
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  async function handleSetRole(m: Member, newRole: 'manager' | 'member') {
    setMemberActionId(m.id);
    const res = await setMemberRole(workshopId, m.userId, newRole);
    setMemberActionId(null);
    if (res.success) {
      setLocalMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)));
    }
  }

  async function handleExcludeMember(m: Member) {
    setMemberActionId(m.id);
    const res = await removeMember(workshopId, m.userId);
    setMemberActionId(null);
    if (res.success) {
      setLocalMembers((prev) => prev.filter((x) => x.id !== m.id));
    }
  }

  return (
    <>
        {/* ── 3. Membres & rôles ── */}
        <SectionCard
          title="Membres & rôles"
          description="Gérez les accès et les permissions des membres de l'atelier."
        >
          {isPremium ? (
            <>
            <Row label="Inviter un utilisateur" hint="par tag">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                    placeholder="#tag…"
                    style={{
                      fontSize: 13,
                      fontFamily: "'ui-monospace', 'monospace', inherit",
                      padding: '7px 12px',
                      border: `1px solid ${ink(0.14)}`,
                      borderRadius: 9,
                      outline: 'none',
                      background: withAlpha(palette.paper, 0.7),
                      color: palette.ink,
                      width: 130,
                      letterSpacing: '0.04em',
                    }}
                  />
                  <SmallBtn tone="dark" onClick={handleInvite} disabled={inviting || !tagInput.trim()}>
                    {inviting ? 'envoi…' : 'inviter'}
                  </SmallBtn>
                </div>
                {inviteMsg && (
                  <span style={{ fontSize: 12, color: inviteMsg.type === 'success' ? palette.green : palette.danger, textAlign: 'right', maxWidth: 280 }}>
                    {inviteMsg.text}
                  </span>
                )}
              </div>
            </Row>

            {pendingInvites.length > 0 && (
              <div style={{ marginTop: 4, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginBottom: 8 }}>
                  Invitations en attente ({pendingInvites.length})
                </div>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 10,
                      background: withAlpha(palette.amber, 0.06),
                      border: `1px solid ${withAlpha(palette.amber, 0.18)}`,
                    }}
                  >
                    <Mail size={16} style={{ color: palette.amber, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 450, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.displayName}
                      </div>
                      <div style={{ fontSize: 11, color: palette.amber }}>
                        en attente · {inv.uniqueTag}
                      </div>
                    </div>
                    <SmallBtn
                      tone="danger"
                      onClick={() => handleCancelInvite(inv.userId)}
                      disabled={cancelingInvite === inv.userId}
                    >
                      {cancelingInvite === inv.userId ? 'annulation…' : 'annuler'}
                    </SmallBtn>
                  </div>
                ))}
              </div>
            )}
            </>
          ) : (
            <Row label="Inviter un utilisateur" hint="par tag">
              <span
                style={{
                  fontSize: 12,
                  color: palette.inkFaint,
                  background: ink(0.05),
                  border: `1px solid ${ink(0.08)}`,
                  borderRadius: 9,
                  padding: '7px 12px',
                }}
              >
                disponible pour les ateliers Premium
              </span>
            </Row>
          )}

          {/* Demandes d'adhésion en attente (tous les ateliers) */}
          {joinRequests.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginBottom: 8 }}>
                Demandes d&apos;adhésion ({joinRequests.length})
              </div>
              {joinRequests.map((req) => (
                <div
                  key={req.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 10,
                    background: withAlpha(palette.green, 0.06),
                    border: `1px solid ${withAlpha(palette.green, 0.18)}`,
                  }}
                >
                  <UserPlus size={16} style={{ color: palette.green, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 450, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: palette.inkSoft }}>
                      demande · {req.uniqueTag}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <SmallBtn tone="dark" onClick={() => handleApproveJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      {joinReqActionId === req.userId ? '…' : 'accepter'}
                    </SmallBtn>
                    <SmallBtn tone="danger" onClick={() => handleRejectJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      refuser
                    </SmallBtn>
                  </div>
                </div>
              ))}
            </div>
          )}

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
                  color: palette.paper,
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
                    color: palette.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {member.displayName}
                </div>
                <div style={{ fontSize: 11, color: palette.inkFaint }}>
                  {ROLE_LABEL[member.role]} · {member.uniqueTag}
                </div>
              </div>

              {/* Actions — uniquement sur un membre de rang strictement inférieur */}
              {member.role !== 'owner' && actorRank > ROLE_RANK[member.role] && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {member.role === 'member' && (
                    <SmallBtn tone="ghost" disabled={memberActionId === member.id} onClick={() => handleSetRole(member, 'manager')}>
                      promouvoir
                    </SmallBtn>
                  )}
                  {member.role === 'manager' && (
                    <SmallBtn tone="ghost" disabled={memberActionId === member.id} onClick={() => handleSetRole(member, 'member')}>
                      rétrograder
                    </SmallBtn>
                  )}
                  <SmallBtn tone="danger" disabled={memberActionId === member.id} onClick={() => handleExcludeMember(member)}>
                    exclure
                  </SmallBtn>
                </div>
              )}
            </div>
          ))}
        </SectionCard>
    </>
  );
}
