'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, UserPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import Modal from '@/components/Modal';
import {
  inviteMemberByTag, getWorkshopInvitations, cancelInvitation, setMemberRole, removeMember,
  getJoinRequests, approveJoinRequest, rejectJoinRequest, type PendingInvite,
  createMemberGroup, updateMemberGroup, deleteMemberGroup, setMemberGroups as setMemberGroupsAction, type MemberGroup,
} from '@/app/actions/workshops';
import { LABEL_COLORS } from '../tabs/examen/examShared';
import { ROLE_RANK, avatarGradient, Row, SmallBtn, SectionCard, type Member, type WorkshopRole } from './settingsShared';

export default function MembersSection({ workshopId, isPremium, currentUserRole, members, groups }: { workshopId: string; isPremium: boolean; currentUserRole: WorkshopRole; members: Member[]; groups: MemberGroup[] }) {
  const t = useTranslations('settings');
  const actorRank = ROLE_RANK[currentUserRole];
  const [tagInput, setTagInput] = useState('');
  const [localMembers, setLocalMembers] = useState<Member[]>(members);

  // ── Groupes de membres (étiquettes multi-valuées, cf. libellés de questions) ──
  const [localGroups, setLocalGroups] = useState<MemberGroup[]>(groups);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupColor, setEditGroupColor] = useState('');
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<string | null>(null);
  // Groupe actuellement sélectionné comme filtre/vue — null = tous les membres.
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  // Répartition « dans le groupe » / « autres membres » figée au moment où le
  // groupe est sélectionné : cocher/décocher une case pendant la consultation
  // ne doit PAS faire sauter la ligne d'une liste à l'autre (l'utilisateur
  // perdrait de vue la ligne qu'il vient de cocher par erreur). La répartition
  // n'est recalculée que lorsqu'on change de groupe (ou qu'on revient à « tous
  // les membres »), volontairement indépendante des mises à jour de localMembers.
  const [frozenPartition, setFrozenPartition] = useState<{ inGroupIds: string[]; otherIds: string[] } | null>(null);
  useEffect(() => {
    if (!filterGroupId) {
      setFrozenPartition(null);
      return;
    }
    setFrozenPartition({
      inGroupIds: localMembers.filter((m) => m.groupIds.includes(filterGroupId)).map((m) => m.id),
      otherIds: localMembers.filter((m) => !m.groupIds.includes(filterGroupId)).map((m) => m.id),
    });
    // localMembers volontairement exclu : ne figer la répartition qu'au changement de groupe, pas à chaque mise à jour de localMembers (cf. commentaire ci-dessus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterGroupId]);

  function handleAddGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const id = 'group' + Date.now();
    const color = LABEL_COLORS[localGroups.length % LABEL_COLORS.length];
    const group: MemberGroup = { id, name, color };
    setLocalGroups((prev) => [...prev, group]);
    setNewGroupName('');
    setCreatingGroup(false);
    createMemberGroup(workshopId, group).catch((err) => console.error('création groupe échouée', err));
  }

  function openEditGroup(group: MemberGroup) {
    setEditingGroup(group.id);
    setEditGroupName(group.name);
    setEditGroupColor(group.color);
  }

  function saveEditGroup() {
    if (!editingGroup) return;
    const group = localGroups.find((g) => g.id === editingGroup);
    if (!group) return;
    const name = editGroupName.trim();
    const updated: MemberGroup = { ...group, name: name || group.name, color: editGroupColor || group.color };
    setLocalGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditingGroup(null);
    updateMemberGroup(workshopId, updated).catch((err) => console.error('modification groupe échouée', err));
  }

  function confirmDeleteGroup() {
    if (!pendingDeleteGroup) return;
    const id = pendingDeleteGroup;
    setLocalGroups((prev) => prev.filter((g) => g.id !== id));
    setLocalMembers((prev) => prev.map((m) => (m.groupIds.includes(id) ? { ...m, groupIds: m.groupIds.filter((g) => g !== id) } : m)));
    if (filterGroupId === id) setFilterGroupId(null);
    if (editingGroup === id) setEditingGroup(null);
    setPendingDeleteGroup(null);
    deleteMemberGroup(workshopId, id).catch((err) => console.error('suppression groupe échouée', err));
  }

  // Bascule l'appartenance d'un membre à un groupe — utilisé aussi bien par les
  // boutons rapides « ajouter »/« retirer » que par un futur appelant générique.
  function toggleMemberGroup(member: Member, groupId: string) {
    const nextGroupIds = member.groupIds.includes(groupId)
      ? member.groupIds.filter((g) => g !== groupId)
      : [...member.groupIds, groupId];
    setLocalMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, groupIds: nextGroupIds } : m)));
    setMemberGroupsAction(workshopId, member.userId, nextGroupIds).catch((err) => console.error('assignation groupe échouée', err));
  }

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
    // Le serveur supprime aussi une éventuelle invitation en attente pour ce
    // même couple (résolution symétrique) — refléter ça côté client.
    setPendingInvites((prev) => prev.filter((p) => p.userId !== targetUserId));
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
          groupIds: [],
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
      setTagInput('');
      if (result.autoJoined && result.userId) {
        // Cette personne avait déjà une demande d'adhésion en attente : elle est
        // ajoutée directement plutôt qu'invitée (résolution symétrique).
        setInviteMsg({ type: 'success', text: t('members.memberAdded', { name: result.displayName ?? tag }) });
        setJoinRequests((prev) => prev.filter((r) => r.userId !== result.userId));
        setLocalMembers((prev) => [
          ...prev,
          {
            id: `inv-${result.userId}`,
            userId: result.userId!,
            role: 'member',
            joinedAt: new Date().toISOString(),
            displayName: result.displayName ?? tag,
            uniqueTag: tag,
            groupIds: [],
          },
        ]);
      } else {
        setInviteMsg({ type: 'success', text: t('members.inviteSent', { name: result.displayName ?? tag }) });
        getWorkshopInvitations(workshopId).then(setPendingInvites).catch(console.error);
      }
    } else {
      setInviteMsg({ type: 'error', text: result.error ?? t('err.send') });
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
          title={t('members.title')}
          description={t('members.desc')}
        >
          {isPremium ? (
            <>
            <Row label={t('members.inviteLabel')} hint={t('members.inviteHint')}>
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
                    {inviting ? t('members.inviting') : t('members.invite')}
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
                  {t('members.pendingInvites', { count: pendingInvites.length })}
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
                        {t('members.waiting')} · {inv.uniqueTag}
                      </div>
                    </div>
                    <SmallBtn
                      tone="danger"
                      onClick={() => handleCancelInvite(inv.userId)}
                      disabled={cancelingInvite === inv.userId}
                    >
                      {cancelingInvite === inv.userId ? t('members.canceling') : t('members.cancel')}
                    </SmallBtn>
                  </div>
                ))}
              </div>
            )}
            </>
          ) : (
            <Row label={t('members.inviteLabel')} hint={t('members.inviteHint')}>
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
                {t('members.premiumOnly')}
              </span>
            </Row>
          )}

          {/* Groupes — filtre + gestion, compact pour ne pas prendre toute la largeur */}
          <div style={{ marginTop: 4, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginBottom: 8 }}>
              {t('groups.title')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                onClick={() => setFilterGroupId(null)}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                  border: filterGroupId === null ? '1px solid rgba(45,42,36,0.30)' : `1px solid ${ink(0.10)}`,
                  background: filterGroupId === null ? palette.ink : ink(0.04),
                  color: filterGroupId === null ? palette.parchment : '#3a352c',
                }}
              >
                {t('groups.filterAll')}
              </button>
              {localGroups.map((g) => {
                const active = filterGroupId === g.id;
                const memberCount = localMembers.filter((m) => m.groupIds.includes(g.id)).length;
                return (
                  <span key={g.id} style={{ position: 'relative', display: 'inline-flex' }}>
                    <button
                      onClick={() => setFilterGroupId(active ? null : g.id)}
                      title={t('groups.viewTitle')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999,
                        cursor: 'pointer', fontFamily: 'inherit',
                        border: active ? '1px solid rgba(45,42,36,0.30)' : `1px solid ${ink(0.10)}`,
                        background: active ? palette.ink : ink(0.04),
                        color: active ? palette.parchment : '#3a352c',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                      {g.name}
                      <span style={{ color: active ? withAlpha(palette.parchment, 0.7) : palette.inkFaint }}>· {memberCount}</span>
                    </button>
                    <button
                      onClick={() => (editingGroup === g.id ? setEditingGroup(null) : openEditGroup(g))}
                      title={t('groups.editTitle')}
                      style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', border: `1px solid ${ink(0.15)}`, background: palette.paper, color: palette.inkFaint, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Pencil size={7} />
                    </button>
                    {editingGroup === g.id && (
                      <>
                        <div onClick={() => setEditingGroup(null)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
                        <div style={{ position: 'absolute', top: 26, left: 0, zIndex: 30, width: 190, background: palette.paper, border: `1px solid ${ink(0.10)}`, borderRadius: 12, boxShadow: `0 12px 32px ${ink(0.16)}`, padding: 10 }}>
                          <input
                            autoFocus
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEditGroup(); if (e.key === 'Escape') setEditingGroup(null); }}
                            style={{ width: '100%', fontSize: 11.5, padding: '6px 8px', borderRadius: 8, border: `1px solid ${ink(0.14)}`, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                            {LABEL_COLORS.map((c) => (
                              <button
                                key={c}
                                onClick={() => setEditGroupColor(c)}
                                title={c}
                                style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: editGroupColor === c ? '2px solid #2d2a24' : `1px solid ${ink(0.15)}`, cursor: 'pointer', padding: 0 }}
                              />
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <button onClick={saveEditGroup} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: 'none', background: palette.ink, color: palette.parchment, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {t('groups.save')}
                            </button>
                            <button onClick={() => setEditingGroup(null)} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${ink(0.10)}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {t('groups.cancel')}
                            </button>
                          </div>
                          <button
                            onClick={() => setPendingDeleteGroup(g.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${withAlpha(palette.danger, 0.30)}`, background: withAlpha(palette.danger, 0.08), color: palette.danger, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            <Trash2 size={11} />
                            {t('groups.delete')}
                          </button>
                        </div>
                      </>
                    )}
                  </span>
                );
              })}
              {creatingGroup ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName(''); } }}
                    placeholder={t('groups.namePlaceholder')}
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: `1px solid ${ink(0.18)}`, outline: 'none', fontFamily: 'inherit', width: 130 }}
                  />
                  <button onClick={handleAddGroup} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px solid ${ink(0.10)}`, background: palette.ink, color: palette.parchment, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('groups.add')}
                  </button>
                  <button onClick={() => { setCreatingGroup(false); setNewGroupName(''); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px solid ${ink(0.10)}`, background: 'transparent', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('groups.cancel')}
                  </button>
                </span>
              ) : (
                <button onClick={() => setCreatingGroup(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px dashed ${ink(0.20)}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={11} />
                  {t('groups.newGroup')}
                </button>
              )}
            </div>
          </div>

          {/* Demandes d'adhésion en attente (tous les ateliers) */}
          {joinRequests.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginBottom: 8 }}>
                {t('members.joinRequests', { count: joinRequests.length })}
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
                      {t('members.request')} · {req.uniqueTag}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <SmallBtn tone="dark" onClick={() => handleApproveJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      {joinReqActionId === req.userId ? '…' : t('members.approve')}
                    </SmallBtn>
                    <SmallBtn tone="danger" onClick={() => handleRejectJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      {t('members.reject')}
                    </SmallBtn>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Member list — une ligne par membre, avec ses actions contextuelles */}
          {(() => {
            // Rendu d'une ligne : les chips de groupe excluent toujours le groupe
            // actuellement sélectionné (redondant avec la section dans laquelle
            // on se trouve déjà) ; les autres groupes du membre restent affichés.
            function renderMemberRow(member: Member, isLast: boolean, actionSlot: ReactNode) {
              const otherGroupIds = filterGroupId ? member.groupIds.filter((g) => g !== filterGroupId) : member.groupIds;
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: isLast ? 'none' : '1px solid rgba(45,42,36,0.06)',
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
                      {t(`role.${member.role}`)} · {member.uniqueTag}
                    </div>
                  </div>

                  {/* Autres groupes du membre (lecture seule) — le groupe actif n'est pas répété */}
                  {otherGroupIds.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', flexShrink: 0, maxWidth: 200 }}>
                      {otherGroupIds.map((gid) => {
                        const g = localGroups.find((x) => x.id === gid);
                        if (!g) return null;
                        return (
                          <span key={gid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 999, background: ink(0.05), color: palette.inkMuted, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                            {g.name}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {actionSlot}
                </div>
              );
            }

            // Vue « tous les membres » : actions de rôle/exclusion classiques.
            if (!filterGroupId) {
              return localMembers.map((member, i) => renderMemberRow(
                member,
                i === localMembers.length - 1,
                member.role !== 'owner' && actorRank > ROLE_RANK[member.role] ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {member.role === 'member' && (
                      <SmallBtn tone="ghost" disabled={memberActionId === member.id} onClick={() => handleSetRole(member, 'manager')}>
                        {t('members.promote')}
                      </SmallBtn>
                    )}
                    {member.role === 'manager' && (
                      <SmallBtn tone="ghost" disabled={memberActionId === member.id} onClick={() => handleSetRole(member, 'member')}>
                        {t('members.demote')}
                      </SmallBtn>
                    )}
                    <SmallBtn tone="danger" disabled={memberActionId === member.id} onClick={() => handleExcludeMember(member)}>
                      {t('members.exclude')}
                    </SmallBtn>
                  </div>
                ) : null
              ));
            }

            // Vue « groupe sélectionné » : deux listes dont la répartition est figée
            // (frozenPartition, cf. plus haut) — seule la case à cocher reflète
            // l'état réel en direct, la ligne elle-même ne change pas de liste tant
            // que le groupe sélectionné ne change pas.
            const groupId = filterGroupId;
            if (!frozenPartition) return null;
            const inGroup = localMembers.filter((m) => frozenPartition.inGroupIds.includes(m.id));
            const others = localMembers.filter((m) => frozenPartition.otherIds.includes(m.id));
            const checkbox = (member: Member) => (
              <input
                type="checkbox"
                checked={member.groupIds.includes(groupId)}
                onChange={() => toggleMemberGroup(member, groupId)}
                style={{ width: 17, height: 17, cursor: 'pointer', flexShrink: 0 }}
              />
            );
            return (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginTop: 4, marginBottom: 4 }}>
                  {t('groups.inGroupCount', { count: inGroup.length })}
                </div>
                {inGroup.length === 0 && (
                  <div style={{ fontSize: 12.5, color: palette.inkFaint, fontStyle: 'italic', padding: '8px 0' }}>{t('groups.emptyGroup')}</div>
                )}
                {inGroup.map((member, i) => renderMemberRow(member, i === inGroup.length - 1, checkbox(member)))}

                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginTop: 40, marginBottom: 4 }}>
                  {t('groups.otherMembersCount', { count: others.length })}
                </div>
                {others.length === 0 && (
                  <div style={{ fontSize: 12.5, color: palette.inkFaint, fontStyle: 'italic', padding: '8px 0' }}>{t('groups.allInGroup')}</div>
                )}
                {others.map((member, i) => renderMemberRow(member, i === others.length - 1, checkbox(member)))}
              </>
            );
          })()}
        </SectionCard>

        {/* ── Confirmation de suppression d'un groupe ── */}
        {pendingDeleteGroup && (
          <Modal width={380} onClose={() => setPendingDeleteGroup(null)}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: withAlpha(palette.danger, 0.12), color: palette.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Trash2 size={17} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6, textAlign: 'center' }}>
              {t('groups.deleteConfirmTitle')}
            </div>
            <p style={{ fontSize: 12.5, color: palette.inkSoft, textAlign: 'center', margin: '0 0 20px' }}>
              {t('groups.deleteConfirmDesc')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setPendingDeleteGroup(null)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmDeleteGroup}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: palette.danger, color: palette.paper, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('groups.delete')}
              </button>
            </div>
          </Modal>
        )}
    </>
  );
}
