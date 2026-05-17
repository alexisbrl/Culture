'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, FilePlus, Users, Crown, UserCheck, UserMinus,
  Plus, Loader2, Trash2, Copy, Check, Shield
} from 'lucide-react';
import { addMemberByTag, removeMember, deleteWorkshop } from '@/app/actions/workshops';

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
  createdAt: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'member';
  members: Member[];
};

type Tab = 'documents' | 'members';

function MemberRow({
  member,
  isOwner,
  currentUserId,
  locale,
  onRemove,
}: {
  member: Member;
  isOwner: boolean;
  currentUserId: string;
  locale: string;
  onRemove: (userId: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyTag() {
    navigator.clipboard.writeText(member.uniqueTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isCurrentUser = member.userId === currentUserId;

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-sm">
          {member.displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            {member.displayName}
            {isCurrentUser && (
              <span className="ml-2 text-xs text-gray-400">
                ({locale === 'fr' ? 'vous' : 'you'})
              </span>
            )}
          </p>
          <button
            onClick={copyTag}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 transition-colors"
          >
            #{member.uniqueTag}
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            member.role === 'owner'
              ? 'bg-violet-100 text-violet-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {member.role === 'owner'
            ? locale === 'fr' ? 'Propriétaire' : 'Owner'
            : locale === 'fr' ? 'Membre' : 'Member'}
        </span>

        {isOwner && !isCurrentUser && (
          <button
            onClick={() => onRemove(member.userId)}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title={locale === 'fr' ? 'Retirer' : 'Remove'}
          >
            <UserMinus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function WorkshopClient({
  locale,
  workshopId,
  workshopName,
  createdAt,
  currentUserId,
  currentUserRole,
  members: initialMembers,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('documents');
  const [members, setMembers] = useState(initialMembers);
  const isOwner = currentUserRole === 'owner';

  // Add member form
  const [addTag, setAddTag] = useState('');
  const [addRole, setAddRole] = useState<'member' | 'owner'>('member');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Delete workshop
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addTag.trim()) return;
    setIsAdding(true);
    setAddError('');
    setAddSuccess('');

    const result = await addMemberByTag(workshopId, addTag.trim(), addRole);
    if (result.success) {
      setAddSuccess(
        locale === 'fr'
          ? `${result.displayName} a été ajouté(e) avec succès !`
          : `${result.displayName} was added successfully!`
      );
      setAddTag('');
      router.refresh();
    } else {
      setAddError(result.error ?? 'Erreur');
    }
    setIsAdding(false);
  }

  async function handleRemoveMember(targetUserId: string) {
    const result = await removeMember(workshopId, targetUserId);
    if (result.success) {
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
    }
  }

  async function handleDeleteWorkshop() {
    setIsDeleting(true);
    const result = await deleteWorkshop(workshopId);
    if (result.success) {
      router.push(`/${locale}/dashboard`);
    } else {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const formattedDate = new Date(createdAt).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

  const owners = members.filter((m) => m.role === 'owner');
  const regularMembers = members.filter((m) => m.role === 'member');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-0">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-2 text-violet-300 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {locale === 'fr' ? 'Tableau de bord' : 'Dashboard'}
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    isOwner
                      ? 'bg-violet-500/20 text-violet-300 border-violet-400/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  }`}
                >
                  {isOwner
                    ? locale === 'fr' ? '👑 Propriétaire' : '👑 Owner'
                    : locale === 'fr' ? '✓ Membre' : '✓ Member'}
                </span>
                <span className="text-xs text-slate-400">
                  {locale === 'fr' ? `Créé le ${formattedDate}` : `Created ${formattedDate}`}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{workshopName}</h1>
              <p className="text-slate-400 text-sm mt-1">
                {members.length} {locale === 'fr' ? 'participant(s)' : 'participant(s)'}
              </p>
            </div>

            {isOwner && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors self-start sm:self-auto"
              >
                <Trash2 className="w-4 h-4" />
                {locale === 'fr' ? 'Supprimer' : 'Delete'}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {(['documents', 'members'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-xl transition-colors ${
                  activeTab === tab
                    ? 'bg-gray-50 text-gray-900'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab === 'documents'
                  ? locale === 'fr' ? '📄 Documents' : '📄 Documents'
                  : locale === 'fr' ? `👥 Participants (${members.length})` : `👥 Participants (${members.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Documents tab */}
        {activeTab === 'documents' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-24 h-24 rounded-3xl bg-white border-2 border-dashed border-gray-200 flex items-center justify-center mb-6 shadow-sm">
              <FilePlus className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {locale === 'fr' ? 'Aucun document pour le moment' : 'No documents yet'}
            </h2>
            <p className="text-gray-500 text-sm mb-8 max-w-sm">
              {locale === 'fr'
                ? 'Les documents importés apparaîtront ici. Bientôt disponible !'
                : 'Imported documents will appear here. Coming soon!'}
            </p>
            <button
              disabled
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-400 rounded-xl font-medium cursor-not-allowed text-sm"
              title={locale === 'fr' ? 'Fonctionnalité bientôt disponible' : 'Feature coming soon'}
            >
              <FilePlus className="w-4 h-4" />
              {locale === 'fr' ? 'Ajouter un document' : 'Add a document'}
              <span className="ml-1 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                {locale === 'fr' ? 'Bientôt' : 'Soon'}
              </span>
            </button>
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Add member form (owners only) */}
            {isOwner && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-violet-600" />
                  {locale === 'fr' ? 'Ajouter un participant' : 'Add a participant'}
                </h3>
                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={addTag}
                    onChange={(e) => { setAddTag(e.target.value.toUpperCase()); setAddError(''); setAddSuccess(''); }}
                    placeholder={locale === 'fr' ? 'Tag unique (ex: AB3X7K)' : 'Unique tag (e.g: AB3X7K)'}
                    maxLength={6}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 font-mono uppercase"
                    disabled={isAdding}
                  />
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as 'member' | 'owner')}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                    disabled={isAdding}
                  >
                    <option value="member">{locale === 'fr' ? 'Membre' : 'Member'}</option>
                    <option value="owner">{locale === 'fr' ? 'Propriétaire' : 'Owner'}</option>
                  </select>
                  <button
                    type="submit"
                    disabled={addTag.trim().length < 6 || isAdding}
                    className="flex items-center gap-2 px-5 py-2.5 gradient-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    {locale === 'fr' ? 'Ajouter' : 'Add'}
                  </button>
                </form>
                {addError && (
                  <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>
                )}
                {addSuccess && (
                  <p className="mt-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">{addSuccess}</p>
                )}
              </div>
            )}

            {/* Owners */}
            {owners.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    {locale === 'fr' ? 'Propriétaires' : 'Owners'} ({owners.length})
                  </h3>
                </div>
                <div className="p-2">
                  {owners.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      currentUserId={currentUserId}
                      locale={locale}
                      onRemove={handleRemoveMember}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Members */}
            {regularMembers.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    {locale === 'fr' ? 'Membres' : 'Members'} ({regularMembers.length})
                  </h3>
                </div>
                <div className="p-2">
                  {regularMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      currentUserId={currentUserId}
                      locale={locale}
                      onRemove={handleRemoveMember}
                    />
                  ))}
                </div>
              </div>
            )}

            {members.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  {locale === 'fr' ? 'Aucun participant' : 'No participants yet'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              {locale === 'fr' ? 'Supprimer l\'atelier ?' : 'Delete workshop?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {locale === 'fr'
                ? `"${workshopName}" sera définitivement supprimé. Cette action est irréversible.`
                : `"${workshopName}" will be permanently deleted. This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {locale === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={handleDeleteWorkshop}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {locale === 'fr' ? 'Supprimer' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
