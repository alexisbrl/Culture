'use client';

import { palette, withAlpha } from '@/lib/theme';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Plus, Search, Users, Crown, BookMarked, X, ArrowRight,
  Trash2, RotateCcw, Maximize2, Loader2, Sprout, Mail, Check,
} from 'lucide-react';
import { searchWorkshops, requestToJoinWorkshop, restoreWorkshop, getWorkshopPreview, acceptInvitation, declineInvitation, WorkshopCardData } from '@/app/actions/workshops';
import { coverStyleFor, emojiFor } from '@/lib/workshopCover';

type TrashedWorkshop = { id: string; name: string; deleted_at: string; days_remaining: number };

type Props = {
  locale: string;
  firstName: string;
  uniqueTag: string;
  ownedWorkshops: WorkshopCardData[];
  joinedWorkshops: WorkshopCardData[];
  invitations: WorkshopCardData[];
  trashedWorkshops: TrashedWorkshop[];
};

type PreviewData = {
  id: string;
  name: string;
  description: string | null;
  coverStyle: React.CSSProperties;
  emoji: string;
  ownerName: string;
  memberCount: number;
  isMember: boolean;
  hasRequested?: boolean;
  isPremium?: boolean;
  role?: 'owner' | 'manager' | 'member';
  isInvitation?: boolean;
  isMock?: boolean;
};

type Tone = 'amber' | 'sky' | 'sage' | 'wood';
const TONE_CSS: Record<Tone, string> = {
  amber: 'linear-gradient(135deg, #e8d8a8, #c89860)',
  sky: 'linear-gradient(135deg, #c7d4d8, #9eb3b9)',
  sage: 'linear-gradient(135deg, #cfd9c0, #a8b896)',
  wood: 'linear-gradient(135deg, #cbb79a, #a08a72)',
};

const CULTURE_MODULES: Array<{ id: string; name: string; tone: Tone; emoji: string; members: number; briques: number; level: string; desc: string; addedAt: string }> = [
  { id: 'cuisine', name: 'Cuisine du soir', tone: 'amber', emoji: '🍳', members: 4820, briques: 142, level: 'tous niveaux', desc: 'Apprends à improviser un dîner complet à partir de ce que tu as : techniques de base, accords de saveurs, et 40 recettes décomposées en gestes simples.', addedAt: '2026-05-20' },
  { id: 'astro', name: 'Astronomie pour curieux', tone: 'sky', emoji: '✦', members: 2140, briques: 88, level: 'débutant', desc: 'Du système solaire aux galaxies lointaines : repère les constellations, comprends les saisons, et lis le ciel à l’œil nu sans jargon.', addedAt: '2026-06-02' },
  { id: 'jardin', name: 'Jardin de balcon', tone: 'sage', emoji: '🌿', members: 1208, briques: 64, level: 'débutant', desc: 'Faire pousser herbes, fleurs et légumes dans un mètre carré : choix des plantes, arrosage, lumière, et calendrier des semis.', addedAt: '2026-04-11' },
  { id: 'oeno', name: 'Œnologie · introduction', tone: 'wood', emoji: '◐', members: 980, briques: 110, level: 'intermédiaire', desc: 'Déguster avec méthode : cépages, terroirs, vocabulaire, et accords mets-vins — pour parler vin sans prétention.', addedAt: '2026-03-28' },
];

/** Normalise une chaîne pour une comparaison insensible à la casse et aux accents. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Hash déterministe simple (FNV-like) pour produire un ordre pseudo-aléatoire stable. */
function seededHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function workshopToPreview(w: WorkshopCardData): PreviewData {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    coverStyle: coverStyleFor(w.id, w.cover_gradient, w.cover_image_url, w.cover_image_active),
    emoji: emojiFor(w.id, w.emoji),
    ownerName: w.owner_name,
    memberCount: w.member_count,
    isMember: true,
    isPremium: w.is_premium,
    role: w.role ?? 'member',
  };
}

function invitationToPreview(w: WorkshopCardData): PreviewData {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    coverStyle: coverStyleFor(w.id, w.cover_gradient, w.cover_image_url, w.cover_image_active),
    emoji: emojiFor(w.id, w.emoji),
    ownerName: w.owner_name,
    memberCount: w.member_count,
    isMember: false,
    isPremium: w.is_premium,
    isInvitation: true,
  };
}

function moduleToPreview(m: typeof CULTURE_MODULES[number]): PreviewData {
  return {
    id: `culture-${m.id}`,
    name: m.name,
    description: m.desc,
    coverStyle: { backgroundColor: 'transparent', backgroundImage: TONE_CSS[m.tone], backgroundSize: 'auto', backgroundPosition: '0 0' },
    emoji: m.emoji,
    ownerName: 'Culture',
    memberCount: m.members,
    isMember: false,
    isMock: true,
  };
}

export default function DashboardClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <DashboardContent {...props} />
    </Suspense>
  );
}

function DashboardContent({ locale, firstName, uniqueTag, ownedWorkshops, joinedWorkshops, invitations, trashedWorkshops }: Props) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; description: string | null; cover_gradient: string | null; cover_image_url: string | null; cover_image_active: boolean; emoji: string | null; unique_tag: string | null; member_count: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  function closeSearch() {
    setSearchOpen(false);
    searchInputRef.current?.blur();
  }

  useEffect(() => {
    if (!searchOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (preview || previewLoading) return;
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (preview || previewLoading) return;
      if (e.key === 'Escape') closeSearch();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchOpen, preview, previewLoading]);

  const hasWorkshops = ownedWorkshops.length > 0 || joinedWorkshops.length > 0 || invitations.length > 0;

  // ── Deep link ?preview=ID ───────────────────────────────────────────────
  useEffect(() => {
    const previewId = searchParams.get('preview');
    if (!previewId) return;

    const ownMatch = [...ownedWorkshops, ...joinedWorkshops].find((w) => w.id === previewId);
    if (ownMatch) {
      setPreview(workshopToPreview(ownMatch));
      return;
    }

    const inviteMatch = invitations.find((w) => w.id === previewId);
    if (inviteMatch) {
      setPreview(invitationToPreview(inviteMatch));
      return;
    }

    setPreviewLoading(true);
    getWorkshopPreview(previewId).then((data) => {
      setPreviewLoading(false);
      if (!data) return;
      setPreview({
        id: data.id,
        name: data.name,
        description: data.description,
        coverStyle: coverStyleFor(data.id, data.coverGradient, data.coverImageUrl, data.coverImageActive),
        emoji: emojiFor(data.id, data.emoji),
        ownerName: data.ownerName,
        memberCount: data.memberCount,
        isMember: data.isMember,
        hasRequested: data.hasRequested,
        isPremium: data.isPremium,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cultureModulesToShow = (() => {
    const byDate = [...CULTURE_MODULES].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    const normalizedQuery = normalize(searchQuery);
    if (normalizedQuery.length < 2) {
      return byDate;
    }
    const seed = `${uniqueTag}|${normalizedQuery}`;
    const matches = byDate.filter((m) => normalize(m.name).includes(normalizedQuery));
    const rest = byDate.filter((m) => !normalize(m.name).includes(normalizedQuery));
    const sortedMatches = matches.length > 1
      ? [...matches].sort((a, b) => seededHash(seed + a.id) - seededHash(seed + b.id))
      : matches;
    return [...sortedMatches, ...rest];
  })();

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await searchWorkshops(query);
    const normalizedQuery = normalize(query);
    const normalizedTag = query.trim().toUpperCase();
    const exactMatches = results
      .filter((w) => normalize(w.name) === normalizedQuery || w.unique_tag?.toUpperCase() === normalizedTag)
      .slice(0, 4);
    setSearchResults(exactMatches);
    setIsSearching(false);
  }

  async function handleRequestJoin(workshopId: string) {
    setJoiningId(workshopId);
    const result = await requestToJoinWorkshop(workshopId);
    setJoiningId(null);
    if (!result.success) return;
    // Déjà membre (cas limite) → on ouvre l'atelier. Sinon la demande est en attente
    // d'une validation : on reflète l'état « demande envoyée » dans la preview.
    if (result.status === 'already_member') {
      router.push(`/${locale}/workshops/${workshopId}`);
      return;
    }
    setPreview((prev) => (prev && prev.id === workshopId ? { ...prev, hasRequested: true } : prev));
  }

  async function handleAcceptInvitation(workshopId: string) {
    setAcceptingId(workshopId);
    const result = await acceptInvitation(workshopId);
    setAcceptingId(null);
    if (result.success) {
      router.push(`/${locale}/workshops/${workshopId}`);
    }
  }

  async function handleDeclineInvitation(workshopId: string) {
    setDecliningId(workshopId);
    const result = await declineInvitation(workshopId);
    setDecliningId(null);
    if (result.success) {
      setPreview(null);
      router.refresh();
    }
  }

  async function handleRestore(workshopId: string) {
    setRestoringId(workshopId);
    const result = await restoreWorkshop(workshopId);
    if (result.success) router.refresh();
    setRestoringId(null);
  }

  function closePreview() {
    setPreview(null);
    if (searchParams.get('preview')) {
      router.replace(`/${locale}/dashboard`);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#eef6e2] via-[#e4efd4] to-[#d6e7cf] font-sans px-6 lg:px-10 py-8" style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", color: palette.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap');`}</style>

      <div className="max-w-6xl mx-auto rounded-[20px] bg-cream/92 backdrop-blur-xl border border-ink/[0.07] shadow-[0_40px_90px_rgba(45,42,36,0.16)] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-7 pt-6">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-soft mb-1">
              {t('greetingLabel')}
            </div>
            <div className="text-[23px] font-medium text-ink tracking-tight">
              {t('greeting', { name: firstName })}
            </div>
          </div>
          <Link
            href={`/${locale}/workshops/new`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-green text-parchment text-[13px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)] hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" />
            {t('newWorkshop')}
          </Link>
        </div>

        {/* search */}
        <div ref={searchContainerRef} className="relative px-7 pt-5">
          <div className="flex items-center gap-3 px-[18px] py-3 bg-white rounded-[14px] border border-ink/[0.08] shadow-[0_6px_22px_rgba(45,42,36,0.06)]">
            <Search className="w-[18px] h-[18px] text-ink-soft" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex-1 bg-transparent outline-none text-[15px] text-ink"
            />
            {searchOpen ? (
              <button
                onClick={closeSearch}
                className="text-[10px] px-1.5 py-0.5 rounded bg-ink/[0.06] text-ink-muted font-mono hover:bg-ink/10"
              >
                esc
              </button>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/[0.06] text-ink-muted font-mono">⌘K</span>
            )}
          </div>

          {/* explorer panel — overlays the workshops below while search is active */}
          {searchOpen && (
          <div className="absolute left-7 right-7 top-full mt-2 z-20 max-h-[75vh] overflow-y-auto rounded-2xl bg-cream border border-ink/[0.08] shadow-[0_20px_50px_rgba(45,42,36,0.18)] px-5 pt-5 pb-4">
            {searchQuery.trim().length >= 2 ? (
              <>
                <div className="text-[13px] font-medium text-ink mb-3">
                  {t('results')}
                </div>
                {isSearching ? (
                  <div className="text-[13px] text-ink-soft py-3">{t('searching')}</div>
                ) : searchResults.length === 0 ? (
                  <div className="text-[13px] text-ink-soft py-3">{t('noResults')}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-2">
                    {searchResults.map((w) => (
                      <div
                        key={w.id}
                        onClick={() => {
                          setPreviewLoading(true);
                          getWorkshopPreview(w.id).then((data) => {
                            setPreviewLoading(false);
                            if (!data) return;
                            setPreview({
                              id: data.id,
                              name: data.name,
                              description: data.description,
                              coverStyle: coverStyleFor(data.id, data.coverGradient, data.coverImageUrl, data.coverImageActive),
                              emoji: emojiFor(data.id, data.emoji),
                              ownerName: data.ownerName,
                              memberCount: data.memberCount,
                              isMember: data.isMember,
                              hasRequested: data.hasRequested,
                              isPremium: data.isPremium,
                            });
                          });
                        }}
                        className="cursor-pointer rounded-2xl overflow-hidden bg-white/90 border border-ink/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)] flex flex-col"
                      >
                        <div className="relative h-[90px]" style={coverStyleFor(w.id, w.cover_gradient, w.cover_image_url, w.cover_image_active)}>
                          <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{emojiFor(w.id, w.emoji)}</div>
                        </div>
                        <div className="px-3.5 pt-3 pb-3.5">
                          <div className="font-medium text-ink text-sm mb-1">{w.name}</div>
                          <div className="text-[11.5px] text-ink-soft flex items-center gap-1.5">
                            <Users className="w-3 h-3" />
                            {w.member_count} {t('members')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            <div className="text-[13px] font-medium text-ink mb-3.5 mt-3">{t('cultureModules')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {cultureModulesToShow.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setPreview(moduleToPreview(m))}
                  className="cursor-pointer rounded-2xl overflow-hidden bg-white/90 border border-ink/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)] flex flex-col"
                >
                  <div className="relative h-[90px]" style={{ background: TONE_CSS[m.tone] }}>
                    <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{m.emoji}</div>
                  </div>
                  <div className="px-3.5 pt-3 pb-3.5">
                    <div className="font-medium text-ink text-sm mb-1">{m.name}</div>
                    <div className="text-[11.5px] text-ink-soft flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      {m.members.toLocaleString(locale)} {t('members')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* my workshops */}
        <div className="px-7 pt-6 pb-7">
          {!hasWorkshops ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-soft/15 flex items-center justify-center mb-4">
                <Sprout className="w-8 h-8 text-green" />
              </div>
              <h3 className="text-[15px] font-medium text-ink mb-2">
                {t('emptyTitle')}
              </h3>
              <p className="text-ink-soft text-[13px] mb-6 max-w-xs">
                {t('emptyDesc')}
              </p>
              <Link href={`/${locale}/workshops/new`} className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-green text-parchment text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)]">
                <Plus className="w-4 h-4" />
                {t('createWorkshop')}
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {/* owned */}
              <section>
                <div className="flex items-center gap-2 mb-3.5">
                  <Crown className="w-4 h-4 text-amber" />
                  <h2 className="text-[13px] font-medium text-ink">{t('ownedTitle')}</h2>
                  <span className="text-[12px] text-ink-faint">({ownedWorkshops.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {ownedWorkshops.map((w) => (
                    <WorkshopCard key={w.id} workshop={w} locale={locale} onExpand={() => setPreview(workshopToPreview(w))} />
                  ))}
                  <Link
                    href={`/${locale}/workshops/new`}
                    className="rounded-2xl border border-dashed border-ink/[0.18] flex flex-col items-center justify-center gap-2 text-ink-faint hover:text-green hover:border-green/40 transition min-h-[160px]"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-[12.5px] font-medium">{t('newWorkshop')}</span>
                  </Link>
                </div>
              </section>

              {/* joined + invitations */}
              {(joinedWorkshops.length > 0 || invitations.length > 0) && (
                <section>
                  <div className="flex items-center gap-2 mb-3.5">
                    <BookMarked className="w-4 h-4 text-green-soft" />
                    <h2 className="text-[13px] font-medium text-ink">{t('joinedTitle')}</h2>
                    <span className="text-[12px] text-ink-faint">({joinedWorkshops.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* invitations en attente, en tête de liste */}
                    {invitations.map((w) => (
                      <InvitationCard key={`inv-${w.id}`} workshop={w} locale={locale} onOpen={() => setPreview(invitationToPreview(w))} />
                    ))}
                    {joinedWorkshops.map((w) => (
                      <WorkshopCard key={w.id} workshop={w} locale={locale} onExpand={() => setPreview(workshopToPreview(w))} />
                    ))}
                  </div>
                </section>
              )}

              {/* trash */}
              {trashedWorkshops.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3.5">
                    <Trash2 className="w-4 h-4 text-danger" />
                    <h2 className="text-[13px] font-medium text-ink">{t('trashTitle')}</h2>
                    <span className="text-[12px] text-ink-faint">({trashedWorkshops.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {trashedWorkshops.map((w) => (
                      <div key={w.id} className="rounded-2xl border border-danger/20 bg-white/60 p-4 opacity-80">
                        <div className="font-medium text-ink-soft text-sm line-through mb-2">{w.name}</div>
                        <p className="text-[11.5px] text-amber mb-3">
                          {w.days_remaining > 0
                            ? t('trashCountdown', { days: w.days_remaining })
                            : t('trashImminent')}
                        </p>
                        <button
                          onClick={() => handleRestore(w.id)}
                          disabled={restoringId === w.id}
                          className="flex items-center gap-2 text-[12px] font-medium text-green hover:text-[#3f5630] disabled:opacity-50"
                        >
                          {restoringId === w.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('restoring')}</>
                            : <><RotateCcw className="w-3.5 h-3.5" />{t('restore')}</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* preview modal */}
      {(preview || previewLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4" onClick={closePreview}>
          <div className="w-full max-w-2xl rounded-[20px] bg-cream shadow-[0_30px_80px_rgba(45,42,36,0.25)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {previewLoading && !preview ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="w-6 h-6 animate-spin text-ink-soft" />
              </div>
            ) : preview && (
              <>
                <div className="relative h-[180px]" style={preview.coverStyle}>
                  <div className="absolute left-4 bottom-4 w-11 h-11 rounded-xl bg-white/90 flex items-center justify-center shadow-md text-xl">{preview.emoji}</div>
                  <button onClick={closePreview} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center text-ink-muted hover:bg-white">
                    <X className="w-4 h-4" />
                  </button>
                  {(preview.role || preview.isPremium || preview.isInvitation) && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      {preview.isInvitation && (
                        <span
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1"
                          style={{ background: withAlpha(palette.amber, 0.92), color: palette.paper }}
                        >
                          <Mail className="w-3 h-3" /> {t('invitation')}
                        </span>
                      )}
                      {preview.role && (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/85 text-ink-muted font-medium">
                          {t(`role.${preview.role}`)}
                        </span>
                      )}
                      {preview.isPremium && (
                        <span
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                          style={{ background: withAlpha(palette.amberGlow, 0.85), color: '#7a4d20' }}
                        >
                          Premium
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <h2 className="text-[20px] font-medium text-ink mb-1.5">{preview.name}</h2>
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-soft mb-4">
                    <Users className="w-3.5 h-3.5" />
                    <span>{preview.memberCount.toLocaleString(locale)} {t('members')}</span>
                    <span className="w-[2px] h-[2px] rounded-full bg-ink-soft" />
                    <span>{t('createdBy')} {preview.ownerName}</span>
                  </div>
                  {preview.description && (
                    <p className="text-[13.5px] text-[#3a352c] leading-relaxed mb-5">{preview.description}</p>
                  )}

                  {preview.isInvitation ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleAcceptInvitation(preview.id)}
                        disabled={acceptingId === preview.id || decliningId === preview.id}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-green text-parchment text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)] disabled:opacity-60"
                      >
                        {acceptingId === preview.id
                          ? <><Loader2 className="w-4 h-4 animate-spin" />{t('accepting')}</>
                          : <><Check className="w-4 h-4" />{t('acceptInvitation')}</>}
                      </button>
                      <button
                        onClick={() => handleDeclineInvitation(preview.id)}
                        disabled={acceptingId === preview.id || decliningId === preview.id}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] border border-danger/40 text-danger text-[13.5px] font-medium hover:bg-danger/[0.06] disabled:opacity-60"
                      >
                        {decliningId === preview.id
                          ? <><Loader2 className="w-4 h-4 animate-spin" />{t('declining')}</>
                          : <>{t('decline')}</>}
                      </button>
                    </div>
                  ) : preview.isMock ? (
                    <Link href={`/${locale}/dashboard`} onClick={closePreview} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-green text-parchment text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)]">
                      {t('joinMock')} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : preview.isMember ? (
                    <Link href={`/${locale}/workshops/${preview.id}`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-ink text-parchment text-[13.5px] font-medium">
                      {t('enterWorkshop')} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : preview.hasRequested ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-amber/[0.12] text-amber text-[13.5px] font-medium">
                        <Check className="w-4 h-4" />{t('requestSent')}
                      </span>
                      <span className="text-[12px] text-ink-soft">
                        {t('requestPending')}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRequestJoin(preview.id)}
                      disabled={joiningId === preview.id}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-green text-parchment text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)] disabled:opacity-60"
                    >
                      {joiningId === preview.id
                        ? <><Loader2 className="w-4 h-4 animate-spin" />{t('sending')}</>
                        : <>{t('requestToJoin')} <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkshopCard({ workshop, locale, onExpand }: { workshop: WorkshopCardData; locale: string; onExpand: () => void }) {
  const t = useTranslations('dashboard');
  const coverStyle = coverStyleFor(workshop.id, workshop.cover_gradient, workshop.cover_image_url, workshop.cover_image_active);
  return (
    <Link href={`/${locale}/workshops/${workshop.id}`} className="group rounded-2xl overflow-hidden bg-white/90 border border-ink/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)] hover:shadow-[0_10px_28px_rgba(45,42,36,0.12)] hover:-translate-y-0.5 transition flex flex-col">
      <div className="relative h-[90px]" style={coverStyle}>
        <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{emojiFor(workshop.id, workshop.emoji)}</div>
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1">
          {workshop.is_premium && (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-semibold shadow-sm"
              style={{ background: withAlpha(palette.amberGlow, 0.92), color: '#7a4d20' }}
            >
              <Crown className="w-2.5 h-2.5" /> Premium
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExpand(); }}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/0 group-hover:bg-white/85 flex items-center justify-center text-transparent group-hover:text-ink-muted transition"
          aria-label={t('expand')}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3.5 pt-3 pb-3.5">
        <div className="font-medium text-ink text-sm mb-1 line-clamp-2">{workshop.name}</div>
        <div className="text-[11.5px] text-ink-soft flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          {workshop.member_count} {t('members')}
        </div>
      </div>
    </Link>
  );
}

function InvitationCard({ workshop, locale, onOpen }: { workshop: WorkshopCardData; locale: string; onOpen: () => void }) {
  const t = useTranslations('dashboard');
  const coverStyle = coverStyleFor(workshop.id, workshop.cover_gradient, workshop.cover_image_url, workshop.cover_image_active);
  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-2xl overflow-hidden bg-white/90 border-2 border-amber/45 shadow-[0_4px_16px_rgba(168,122,58,0.12)] hover:shadow-[0_10px_28px_rgba(168,122,58,0.18)] hover:-translate-y-0.5 transition flex flex-col"
    >
      <div className="relative h-[90px]" style={coverStyle}>
        <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{emojiFor(workshop.id, workshop.emoji)}</div>
        <span
          className="absolute top-2.5 left-2.5 text-[10.5px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
          style={{ background: withAlpha(palette.amber, 0.92), color: palette.paper }}
        >
          <Mail className="w-2.5 h-2.5" /> {t('invitation')}
        </span>
      </div>
      <div className="px-3.5 pt-3 pb-3.5">
        <div className="font-medium text-ink text-sm mb-1 line-clamp-2">{workshop.name}</div>
        <div className="text-[11.5px] text-amber font-medium truncate">
          {t('invitedBy')} {workshop.owner_name}
        </div>
      </div>
    </button>
  );
}
