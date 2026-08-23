'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, UserPlus, Plus, Trash2, EllipsisVertical, ArrowUp, ArrowDown, UserMinus, Search, X } from 'lucide-react';
import { palette, ink, shadow, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import {
  inviteMemberByTag, getWorkshopInvitations, cancelInvitation, setMemberRole, removeMember,
  getJoinRequests, approveJoinRequest, rejectJoinRequest, type PendingInvite,
  createMemberGroup, updateMemberGroup, deleteMemberGroup, setMemberGroups as setMemberGroupsAction, type MemberGroup,
} from '@/app/actions/workshops';
import { LABEL_COLORS, LabelPill, labelTint, SelectMenu } from '../tabs/examen/examShared';
import { ROLE_RANK, avatarTone, type Member, type WorkshopRole } from './settingsShared';
import { useLiveData } from '@/lib/useLiveData';

// Valeur de filtre réservée à la vue « sans groupe » — elle n'est jamais un
// identifiant de groupe (préfixe `__`, comme NEVER_EXAM_ID côté examen).
const NO_GROUP_FILTER = '__no-group__';

// Hauteur imposée à la sous-ligne « rôle · tag (+ groupes) » d'une ligne de
// membre. Valeur = la hauteur d'une pastille `LabelPill` en taille `xs`, qui est
// l'élément le plus haut que cette ligne puisse porter. C'est elle qui rend
// toutes les lignes strictement identiques, avec ou sans groupe. Si les
// dimensions de `LABEL_PILL_SIZES.xs` changent (`examen/examShared.tsx`), cette
// valeur est à reprendre — c'est la seule chose qui les relie.
const MEMBER_SUBLINE_HEIGHT = 24;

// Casse et accents retirés des deux côtés de la comparaison : une recherche qui
// exige l'accent exact ne trouve pas les noms qu'on tape le plus vite.
const normalizeForSearch = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Bouton de ligne façon maquette (Paramètres > Membres) : plus grand rayon et
// graisse que SmallBtn, aligné sur les boutons des lignes de membres du modèle.
function RowBtn({ children, tone = 'ghost', onClick, disabled }: { children: ReactNode; tone?: 'ghost' | 'danger'; onClick?: () => void; disabled?: boolean }) {
  const styles = {
    ghost: { background: palette.cream, border: `1px solid ${palette.lineStrong}`, color: palette.inkMuted },
    danger: { background: palette.dangerTint, border: `1px solid ${withAlpha(palette.danger, 0.35)}`, color: palette.danger },
  }[tone];
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        borderRadius: 12,
        padding: '8px 13px',
        whiteSpace: 'nowrap',
        background: disabled ? palette.surfaceSunken : styles.background,
        border: disabled ? `1px solid ${palette.line}` : styles.border,
        color: disabled ? palette.inkFaint : styles.color,
      }}
    >
      {children}
    </button>
  );
}

export default function MembersSection({ workshopId, isPremium, currentUserRole, members, groups }: { workshopId: string; isPremium: boolean; currentUserRole: WorkshopRole; members: Member[]; groups: MemberGroup[] }) {
  const t = useTranslations('settings');
  const actorRank = ROLE_RANK[currentUserRole];
  const [tagInput, setTagInput] = useState('');
  const [localMembers, setLocalMembers] = useState<Member[]>(members);

  // ── Recherche dans la liste ──
  // Elle filtre ce qui est AFFICHÉ, dans les trois vues, et ne touche ni à la
  // répartition figée d'un groupe ni à l'ordre : chercher, c'est masquer les
  // lignes qui ne répondent pas, pas réorganiser la liste sous les doigts.
  // Comparaison sans accents ni casse — « COCAUD » se trouve en tapant « cocaud »
  // et « Tuloup » en tapant « tulóup » aussi bien que l'inverse.
  const [search, setSearch] = useState('');
  const query = normalizeForSearch(search);
  const matchesSearch = (m: Member) => !query || normalizeForSearch(m.displayName).includes(query) || normalizeForSearch(m.uniqueTag).includes(query);

  // ── Ordre de la liste : alphabétique, départagé par la date d'arrivée ──
  // La requête serveur ne trie pas (`getWorkshop`, src/lib/workshops/core.ts) :
  // Postgres rendait les membres dans un ordre ni défini ni stable, et un même
  // atelier pouvait s'afficher dans deux ordres à deux chargements. L'ordre est
  // donc posé ici, et il est **fixe** — pas de sélecteur : sur une liste qu'on
  // parcourt pour retrouver quelqu'un, l'ordre alphabétique est le seul dont on
  // n'a pas à se demander lequel est actif.
  const sortedMembers = useMemo(() => {
    // `localeCompare` et non `<` : sans lui, « Élodie » passe après « Zoé ».
    // La date d'arrivée départage les homonymes — deux « Alexis Bourillon »
    // doivent tomber dans un ordre stable, pas dans celui que rend Postgres.
    return [...localMembers].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      || a.joinedAt.localeCompare(b.joinedAt));
  }, [localMembers]);

  // ── Groupes de membres (étiquettes multi-valuées, cf. libellés de questions) ──
  const [localGroups, setLocalGroups] = useState<MemberGroup[]>(groups);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupColor, setEditGroupColor] = useState('');
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<string | null>(null);
  // Groupe actuellement sélectionné comme filtre/vue — null = tous les membres,
  // NO_GROUP_FILTER = les membres qui n'appartiennent à aucun groupe. Ce dernier
  // n'est pas un groupe : il n'a rien à modifier ni à cocher, c'est une vue
  // filtrée en lecture, d'où le sentinelle plutôt qu'une entrée de localGroups.
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  // Le groupe réel sélectionné (null pour « tous les membres » ET pour « sans
  // groupe ») : tout ce qui manipule un vrai groupe passe par lui.
  const selectedGroupId = filterGroupId === NO_GROUP_FILTER ? null : filterGroupId;
  // Répartition « dans le groupe » / « autres membres » figée au moment où le
  // groupe est sélectionné : cocher/décocher une case pendant la consultation
  // ne doit PAS faire sauter la ligne d'une liste à l'autre (l'utilisateur
  // perdrait de vue la ligne qu'il vient de cocher par erreur). La répartition
  // n'est recalculée que lorsqu'on change de groupe (ou qu'on revient à « tous
  // les membres »), volontairement indépendante des mises à jour de localMembers.
  const [frozenPartition, setFrozenPartition] = useState<{ inGroupIds: string[]; otherIds: string[] } | null>(null);
  useEffect(() => {
    if (!selectedGroupId) {
      setFrozenPartition(null);
      return;
    }
    setFrozenPartition({
      inGroupIds: localMembers.filter((m) => m.groupIds.includes(selectedGroupId)).map((m) => m.id),
      otherIds: localMembers.filter((m) => !m.groupIds.includes(selectedGroupId)).map((m) => m.id),
    });
    // localMembers volontairement exclu : ne figer la répartition qu'au changement de groupe, pas à chaque mise à jour de localMembers (cf. commentaire ci-dessus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

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
    // Retour à « tous les membres » si la vue courante disparaît : le groupe
    // supprimé, mais aussi « sans groupe » quand c'était le dernier groupe (sa
    // pastille n'est plus affichée, elle ne pourrait plus être désélectionnée).
    if (filterGroupId === id || (filterGroupId === NO_GROUP_FILTER && localGroups.length <= 1)) setFilterGroupId(null);
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

  // Ces deux listes sont ce qui ARRIVE de l'extérieur : une demande d'adhésion
  // ou l'état d'une invitation apparaît sans que le gestionnaire ait rien fait.
  // Elles se tiennent donc à jour toutes seules (`useLiveData`), sans qu'on ait
  // à rafraîchir la page. La liste des membres, elle, n'est PAS sondée : on
  // l'édite (cases à cocher des groupes), et une liste qui se réordonne sous
  // les doigts fait perdre la ligne qu'on visait — voir `useLiveData`.
  const liveInvites = useLiveData(() => getWorkshopInvitations(workshopId), setPendingInvites, { enabled: isPremium });
  const liveJoinRequests = useLiveData(() => getJoinRequests(workshopId), setJoinRequests);

  async function handleApproveJoinRequest(targetUserId: string) {
    setJoinReqActionId(targetUserId);
    const result = await approveJoinRequest(workshopId, targetUserId);
    setJoinReqActionId(null);
    if (!result.success) return;
    // Les deux listes viennent de changer côté serveur : une lecture partie
    // avant cet appel ferait réapparaître la demande qu'on vient d'accepter.
    liveJoinRequests.invalidate();
    liveInvites.invalidate();
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
      liveJoinRequests.invalidate();
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
        liveJoinRequests.invalidate();
        liveInvites.invalidate();
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
        liveInvites.refresh();
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
      liveInvites.invalidate();
      setPendingInvites((prev) => prev.filter((p) => p.userId !== targetUserId));
    }
  }

  // ── Gestion des rôles / exclusion (règles de rang appliquées côté serveur) ──
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  async function handleSetRole(m: Member, newRole: 'manager' | 'member') {
    if (memberActionId === m.id) return;
    setMemberActionId(m.id);
    const res = await setMemberRole(workshopId, m.userId, newRole);
    setMemberActionId(null);
    if (res.success) {
      setLocalMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)));
    }
  }

  // Exclure est la seule action de ce menu qui ne se rattrape pas : la
  // personne perd l'accès et sa progression, et rien dans l'interface ne
  // permet de la « remettre ». Elle passe donc par une confirmation, comme la
  // suppression d'un groupe. Promouvoir et rétrograder, eux, s'annulent d'un
  // clic — leur en demander une serait du bruit.
  const [pendingExclude, setPendingExclude] = useState<Member | null>(null);

  async function handleExcludeMember(m: Member) {
    if (memberActionId === m.id) return;
    setMemberActionId(m.id);
    const res = await removeMember(workshopId, m.userId);
    setMemberActionId(null);
    if (res.success) {
      setLocalMembers((prev) => prev.filter((x) => x.id !== m.id));
    }
  }

  const inviteDisabled = inviting || !tagInput.trim();

  return (
    <>
        {/* ── 3. Membres & rôles — carte pleine largeur façon maquette ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink }}>{t('members.title')}</div>
          </div>
          <div style={{ background: palette.surfaceRaised, borderRadius: 20, border: `1px solid ${palette.line}`, overflow: 'hidden' }}>

          {/* Inviter un utilisateur */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px', padding: '14px 18px', borderBottom: `1px solid ${palette.line}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: palette.ink }}>{t('members.inviteLabel')}</div>
            {isPremium ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                    placeholder="#tag…"
                    style={{
                      fontSize: 13.5,
                      fontFamily: "'ui-monospace', 'monospace', inherit",
                      letterSpacing: '0.04em',
                      padding: '9px 12px',
                      border: `1px solid ${palette.line}`,
                      borderRadius: 12,
                      outline: 'none',
                      background: palette.cream,
                      color: palette.ink,
                      width: 130,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={inviteDisabled ? undefined : handleInvite}
                    disabled={inviteDisabled}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 12,
                      padding: '10px 16px',
                      whiteSpace: 'nowrap',
                      border: 'none',
                      cursor: inviteDisabled ? 'not-allowed' : 'pointer',
                      background: inviteDisabled ? palette.surfaceSunken : palette.green,
                      color: inviteDisabled ? palette.inkFaint : palette.onGreen,
                    }}
                  >
                    {inviting ? t('members.inviting') : t('members.invite')}
                  </button>
                </div>
                {inviteMsg && (
                  <span style={{ fontSize: 12, color: inviteMsg.type === 'success' ? palette.green : palette.danger, textAlign: 'right', maxWidth: 280 }}>
                    {inviteMsg.text}
                  </span>
                )}
              </div>
            ) : (
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
            )}
          </div>

          {/* Invitations en attente (premium) */}
          {isPremium && pendingInvites.length > 0 && (
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${palette.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: palette.inkFaint, marginBottom: 8 }}>
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
                  <RowBtn
                    tone="danger"
                    onClick={() => handleCancelInvite(inv.userId)}
                    disabled={cancelingInvite === inv.userId}
                  >
                    {cancelingInvite === inv.userId ? t('members.canceling') : t('members.cancel')}
                  </RowBtn>
                </div>
              ))}
            </div>
          )}

          {/* Groupes — filtre + gestion */}
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: palette.inkFaint, marginBottom: 10 }}>
              {t('groups.title')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {/* Les trois vues (tous / un groupe / sans groupe) sont la même
                  pastille que les libellés de questions — `LabelPill` : sélection
                  au liseré d'encre, jamais au fond, qui reste l'identité du
                  groupe. « tous les membres » et « sans groupe » n'ont pas de
                  couleur : `LabelPill` les rend alors en pastille neutre. */}
              <LabelPill
                name={t('groups.filterAll')}
                size="md"
                active={filterGroupId === null}
                onClick={() => setFilterGroupId(null)}
              />
              {localGroups.map((g) => {
                const active = filterGroupId === g.id;
                return (
                  <span key={g.id} style={{ position: 'relative', display: 'inline-flex' }}>
                    {/* Le crayon vit DANS la pastille, à gauche du nom, comme sur
                        les libellés de questions — il ne se pose plus en pastille
                        flottante sur son coin. */}
                    <LabelPill
                      name={g.name}
                      color={g.color}
                      size="md"
                      active={active}
                      onClick={() => setFilterGroupId(active ? null : g.id)}
                      onEdit={() => (editingGroup === g.id ? setEditingGroup(null) : openEditGroup(g))}
                      editTitle={t('groups.editTitle')}
                    />
                    {editingGroup === g.id && (
                      <>
                        <div onClick={() => setEditingGroup(null)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 190, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg, padding: 10 }}>
                          <input
                            autoFocus
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEditGroup(); if (e.key === 'Escape') setEditingGroup(null); }}
                            style={{ width: '100%', fontSize: 11.5, padding: '7px 8px', borderRadius: 8, border: `1px solid ${palette.lineStrong}`, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box', background: palette.surfaceInput, color: palette.ink }}
                          />
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                            {/* Le témoin montre l'aplat réellement obtenu sur la
                                pastille (`labelTint`), pas la couleur brute —
                                même règle que `LabelEditor` côté examen. */}
                            {LABEL_COLORS.map((c) => (
                              <Tooltip key={c} content={c}>
                                <button
                                  onClick={() => setEditGroupColor(c)}
                                  aria-label={c}
                                  style={{ width: 16, height: 16, borderRadius: '50%', background: labelTint(c), border: editGroupColor === c ? `2px solid ${palette.ink}` : `1px solid ${withAlpha(c, 0.55)}`, cursor: 'pointer', padding: 0 }}
                                />
                              </Tooltip>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <button onClick={saveEditGroup} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 8, border: 'none', background: palette.ink, color: palette.onInk, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {t('groups.save')}
                            </button>
                            <button onClick={() => setEditingGroup(null)} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {t('groups.cancel')}
                            </button>
                          </div>
                          <button
                            onClick={() => setPendingDeleteGroup(g.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: 11, padding: '6px 8px', borderRadius: 8, border: `1px solid ${withAlpha(palette.danger, 0.30)}`, background: withAlpha(palette.danger, 0.08), color: palette.danger, cursor: 'pointer', fontFamily: 'inherit' }}
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
              {/* « sans groupe » ferme toujours la rangée, juste avant le bouton
                  de création : c'est la dernière vue de la liste, pas un groupe.
                  Sans aucun groupe défini, elle dirait exactement la même chose
                  que « tous les membres » — on ne l'affiche donc pas. */}
              {localGroups.length > 0 && (
                <LabelPill
                  name={t('groups.noGroup')}
                  size="md"
                  active={filterGroupId === NO_GROUP_FILTER}
                  onClick={() => setFilterGroupId(filterGroupId === NO_GROUP_FILTER ? null : NO_GROUP_FILTER)}
                />
              )}
              {creatingGroup ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName(''); } }}
                    placeholder={t('groups.namePlaceholder')}
                    style={{ fontSize: 12.5, padding: '7px 12px', borderRadius: 999, border: `1px solid ${palette.lineStrong}`, outline: 'none', fontFamily: 'inherit', width: 140, background: palette.surfaceInput, color: palette.ink, boxSizing: 'border-box' }}
                  />
                  <button onClick={handleAddGroup} style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999, border: `1px solid ${palette.ink}`, background: palette.ink, color: palette.onInk, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {t('groups.add')}
                  </button>
                  <button onClick={() => { setCreatingGroup(false); setNewGroupName(''); }} style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999, border: `1px solid ${palette.line}`, background: 'transparent', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {t('groups.cancel')}
                  </button>
                </span>
              ) : (
                <button onClick={() => setCreatingGroup(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999, border: `1.5px dashed ${palette.amber}`, background: 'transparent', color: palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  <Plus size={12} />
                  {t('groups.newGroup')}
                </button>
              )}
            </div>
          </div>

          {/* Demandes d'adhésion en attente (tous les ateliers) */}
          {joinRequests.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${palette.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: palette.inkFaint, marginBottom: 8 }}>
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
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <RowBtn tone="ghost" onClick={() => handleApproveJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      {joinReqActionId === req.userId ? '…' : t('members.approve')}
                    </RowBtn>
                    <RowBtn tone="danger" onClick={() => handleRejectJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      {t('members.reject')}
                    </RowBtn>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recherche — en tête de liste, sous les groupes : elle porte sur ce
              que la vue courante affiche, quelle que soit la vue. Le champ n'a
              pas son propre cadre (contrairement à la barre d'outils de la
              banque de questions) : posé pleine largeur dans la carte, il se lit
              comme l'en-tête de la liste plutôt que comme un objet posé dessus. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderTop: `1px solid ${palette.line}` }}>
            <Search size={15} strokeWidth={1.75} color={palette.inkFaint} style={{ flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }}
              placeholder={t('members.searchPlaceholder')}
              aria-label={t('members.searchPlaceholder')}
              style={{ flex: 1, minWidth: 0, fontSize: 13, color: palette.ink, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }}
            />
            {search !== '' && (
              <Tooltip content={t('members.searchClear')}>
                <button
                  onClick={() => setSearch('')}
                  aria-label={t('members.searchClear')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 20, height: 20, borderRadius: '50%', border: 'none', background: ink(0.07), color: palette.inkSoft, cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              </Tooltip>
            )}
          </div>

          {/* Member list — une ligne par membre, avec ses actions contextuelles */}
          {(() => {
            // Ligne façon maquette : avatar rond 38px, nom + « rôle · tag » en
            // sous-ligne, actions (ou case à cocher en mode groupe) à droite.
            // Les chips de groupe du membre excluent toujours le groupe
            // actuellement sélectionné (redondant avec la section dans laquelle
            // on se trouve déjà) ; les autres groupes restent affichés en
            // sous-ligne. Séparateurs en borderTop : chaque ligne trace sa
            // frontière avec ce qui la précède (bloc groupes, bandeau, ligne).
            function renderMemberRow(member: Member, actionSlot: ReactNode) {
              const otherGroupIds = selectedGroupId ? member.groupIds.filter((g) => g !== selectedGroupId) : member.groupIds;
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '10px 14px',
                    padding: '12px 18px',
                    borderTop: `1px solid ${palette.line}`,
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      background: avatarTone(member.displayName),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 700,
                      color: palette.onInk,
                      flexShrink: 0,
                    }}
                  >
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>

                  {/* Nom + rôle · tag (+ groupes du membre) */}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: palette.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {member.displayName}
                    </div>
                    {/* Hauteur FIXE, pas `minHeight` : c'est ce qui garantit que
                        toutes les lignes ont exactement la même hauteur, qu'un
                        membre porte des pastilles de groupe ou non. Une pastille
                        `xs` est plus haute que le texte nu (23,75 px contre
                        18,75), et sans hauteur imposée la ligne grandissait de
                        5 px dès qu'un groupe apparaissait — c'est-à-dire aussi
                        au premier groupe attribué, sous les yeux de
                        l'utilisateur. `nowrap` + `overflow: hidden` tiennent le
                        second cas : beaucoup de groupes ne doivent pas non plus
                        faire passer la sous-ligne sur deux rangs. */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden', gap: 8, height: MEMBER_SUBLINE_HEIGHT, fontSize: 12.5, color: palette.inkSoft, marginTop: 2 }}>
                      <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t(`role.${member.role}`)} · {member.uniqueTag}</span>
                      {/* Même pastille que la rangée de filtres, en `xs` : un
                          groupe se reconnaît au même objet partout. Ni clic ni
                          crayon ici — la ligne d'un membre n'est qu'un témoin. */}
                      {otherGroupIds.map((gid) => {
                        const g = localGroups.find((x) => x.id === gid);
                        if (!g) return null;
                        return <LabelPill key={gid} name={g.name} color={g.color} size="xs" />;
                      })}
                    </div>
                  </div>

                  {/* Actions (boutons ou case à cocher) */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {actionSlot}
                  </div>
                </div>
              );
            }

            // Actions de rôle/exclusion regroupées dans un menu ⋮. Elles ne sont
            // ni fréquentes ni urgentes — les laisser en boutons pleins faisait
            // de la promotion et surtout de l'exclusion des cibles de clic
            // permanentes, à côté d'une liste qu'on parcourt surtout pour lire.
            // Le panneau se pose en `position: fixed` (`SelectMenu`, mode
            // flottant) : la carte est en `overflow: hidden`, un menu en
            // `absolute` y serait rogné.
            //
            // Le menu est présent dans TOUTES les vues, groupe sélectionné
            // compris : consulter une classe est justement le moment où l'on
            // veut promouvoir ou exclure quelqu'un, et devoir repasser par
            // « tous les membres » pour ça n'avait pas de raison d'être.
            // Quand il n'y a rien à proposer (le propriétaire, ou une cible de
            // rang supérieur ou égal), on garde sa place vide : sans ça, les
            // cases à cocher de la vue groupe ne seraient plus alignées d'une
            // ligne à l'autre.
            function memberMenu(member: Member) {
              if (member.role === 'owner' || actorRank <= ROLE_RANK[member.role]) {
                return <span style={{ width: 32, height: 32, flexShrink: 0 }} />;
              }
              return (
                  <SelectMenu
                    // Le pictogramme dit le sens de l'action avant le libellé :
                    // la flèche monte pour la promotion, descend pour la
                    // rétrogradation. « exclure » en porte un lui aussi, sans
                    // quoi son libellé décrocherait de la colonne des deux
                    // autres.
                    items={[
                      member.role === 'member'
                        ? { value: 'promote', label: t('members.promote'), icon: <ArrowUp size={14} strokeWidth={2} /> }
                        : { value: 'demote', label: t('members.demote'), icon: <ArrowDown size={14} strokeWidth={2} /> },
                      { value: 'exclude', label: t('members.exclude'), tone: 'danger', icon: <UserMinus size={14} strokeWidth={2} /> },
                    ]}
                    onSelect={(action) => {
                      if (action === 'promote') handleSetRole(member, 'manager');
                      else if (action === 'demote') handleSetRole(member, 'member');
                      else setPendingExclude(member);
                    }}
                    title={t('members.actions')}
                    triggerLabel={t('members.actions')}
                    panelWidth="auto"
                    align="right"
                    triggerStyle={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, padding: 0, borderRadius: 9,
                      border: 'none', background: 'transparent',
                      color: palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <EllipsisVertical size={15} strokeWidth={1.75} />
                  </SelectMenu>
              );
            }

            // Message d'une liste vide : il dit la bonne chose selon la cause.
            // Sous recherche active, « aucun membre dans ce groupe » serait faux
            // — c'est la recherche qui ne rend rien, pas le groupe qui est vide.
            function emptyLine(message: string, withBorder = true) {
              return (
                <div style={{ fontSize: 12.5, color: palette.inkFaint, fontStyle: 'italic', padding: '10px 18px', borderTop: withBorder ? `1px solid ${palette.line}` : undefined }}>
                  {query ? t('members.searchEmpty') : message}
                </div>
              );
            }

            // Vue « tous les membres ».
            if (filterGroupId === null) {
              const shown = sortedMembers.filter(matchesSearch);
              if (shown.length === 0) return emptyLine(t('members.searchEmpty'));
              return shown.map((member) => renderMemberRow(member, memberMenu(member)));
            }

            // Vue « sans groupe » : une simple liste filtrée, en lecture. Pas de
            // case à cocher — il n'y a pas de groupe à cocher, et décocher
            // voudrait dire « retirer de tous ses groupes », une action
            // destructive qui n'a pas sa place derrière une case.
            if (filterGroupId === NO_GROUP_FILTER) {
              const ungrouped = sortedMembers.filter((m) => m.groupIds.length === 0 && matchesSearch(m));
              if (ungrouped.length === 0) return emptyLine(t('groups.emptyNoGroup'));
              return ungrouped.map((member) => renderMemberRow(member, memberMenu(member)));
            }

            // Vue « groupe sélectionné » : deux listes dont la répartition est figée
            // (frozenPartition, cf. plus haut) — seule la case à cocher reflète
            // l'état réel en direct, la ligne elle-même ne change pas de liste tant
            // que le groupe sélectionné ne change pas.
            const groupId = filterGroupId;
            if (!frozenPartition) return null;
            const inGroup = sortedMembers.filter((m) => frozenPartition.inGroupIds.includes(m.id) && matchesSearch(m));
            const others = sortedMembers.filter((m) => frozenPartition.otherIds.includes(m.id) && matchesSearch(m));
            // Case à cocher PUIS menu ⋮ : le menu reste la colonne la plus à
            // droite dans toutes les vues, il ne saute pas d'un pixel quand on
            // sélectionne un groupe.
            const checkbox = (member: Member) => (
              <>
                <Checkbox
                  checked={member.groupIds.includes(groupId)}
                  onChange={() => toggleMemberGroup(member, groupId)}
                />
                {memberMenu(member)}
              </>
            );
            return (
              <>
                {inGroup.length === 0 && emptyLine(t('groups.emptyGroup'))}
                {inGroup.map((member) => renderMemberRow(member, checkbox(member)))}

                {/* Bandeau « autres membres » — pleine largeur, fond enfoncé (maquette) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px', background: palette.surfaceSunken, borderTop: `1px solid ${palette.line}` }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: palette.inkFaint, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {t('groups.otherMembers')}
                  </span>
                  <span style={{ flex: 1, height: 1, background: palette.line }} />
                  <span style={{ fontSize: 11.5, color: palette.inkSoft, whiteSpace: 'nowrap' }}>
                    {t('groups.checkToAdd')}
                  </span>
                </div>
                {others.length === 0 && emptyLine(t('groups.allInGroup'), false)}
                {others.map((member) => renderMemberRow(member, checkbox(member)))}
              </>
            );
          })()}
          </div>
        </div>

        {/* ── Confirmation d'exclusion d'un membre ──
            Le nom est dans le titre, pas seulement dans le corps : c'est la
            seule information qui compte au moment de confirmer, et la liste
            derrière la modale est trop longue pour qu'on vérifie de mémoire
            sur qui on a ouvert le menu. */}
        {pendingExclude && (
          <ConfirmDialog
            width={380}
            icon={<UserMinus size={17} />}
            title={t('members.excludeConfirmTitle', { name: pendingExclude.displayName })}
            description={t('members.excludeConfirmDesc')}
            confirmLabel={t('members.exclude')}
            cancelLabel={t('cancel')}
            onConfirm={() => { const m = pendingExclude; setPendingExclude(null); handleExcludeMember(m); }}
            onCancel={() => setPendingExclude(null)}
          />
        )}

        {/* ── Confirmation de suppression d'un groupe ── */}
        {pendingDeleteGroup && (
          <ConfirmDialog
            width={380}
            icon={<Trash2 size={17} />}
            title={t('groups.deleteConfirmTitle')}
            description={t('groups.deleteConfirmDesc')}
            confirmLabel={t('groups.delete')}
            cancelLabel={t('cancel')}
            onConfirm={confirmDeleteGroup}
            onCancel={() => setPendingDeleteGroup(null)}
          />
        )}
    </>
  );
}
