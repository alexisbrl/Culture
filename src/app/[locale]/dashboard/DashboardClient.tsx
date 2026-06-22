'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    <div className="relative min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#eef6e2] via-[#e4efd4] to-[#d6e7cf] font-sans px-6 lg:px-10 py-8" style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", color: '#2d2a24' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap');`}</style>

      <div className="max-w-6xl mx-auto rounded-[20px] bg-[#fcf9f2]/92 backdrop-blur-xl border border-[#2d2a24]/[0.07] shadow-[0_40px_90px_rgba(45,42,36,0.16)] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-7 pt-6">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#7a766d] mb-1">
              {locale === 'fr' ? 'bonjour' : 'hello'}
            </div>
            <div className="text-[23px] font-medium text-[#2d2a24] tracking-tight">
              {locale === 'fr' ? `${firstName}, voici tes ateliers.` : `${firstName}, here are your workshops.`}
            </div>
          </div>
          <Link
            href={`/${locale}/workshops/new`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#4f6b40] text-[#f4f0e6] text-[13px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)] hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" />
            {locale === 'fr' ? 'nouvel atelier' : 'new workshop'}
          </Link>
        </div>

        {/* search */}
        <div ref={searchContainerRef} className="relative px-7 pt-5">
          <div className="flex items-center gap-3 px-[18px] py-3 bg-white rounded-[14px] border border-[#2d2a24]/[0.08] shadow-[0_6px_22px_rgba(45,42,36,0.06)]">
            <Search className="w-[18px] h-[18px] text-[#7a766d]" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={locale === 'fr' ? 'rechercher par nom, matière ou tag…' : 'search by name, subject or tag…'}
              className="flex-1 bg-transparent outline-none text-[15px] text-[#2d2a24]"
            />
            {searchOpen ? (
              <button
                onClick={closeSearch}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#2d2a24]/[0.06] text-[#5a564c] font-mono hover:bg-[#2d2a24]/10"
              >
                esc
              </button>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2d2a24]/[0.06] text-[#5a564c] font-mono">⌘K</span>
            )}
          </div>

          {/* explorer panel — overlays the workshops below while search is active */}
          {searchOpen && (
          <div className="absolute left-7 right-7 top-full mt-2 z-20 max-h-[75vh] overflow-y-auto rounded-2xl bg-[#fcf9f2] border border-[#2d2a24]/[0.08] shadow-[0_20px_50px_rgba(45,42,36,0.18)] px-5 pt-5 pb-4">
            {searchQuery.trim().length >= 2 ? (
              <>
                <div className="text-[13px] font-medium text-[#2d2a24] mb-3">
                  {locale === 'fr' ? 'résultats' : 'results'}
                </div>
                {isSearching ? (
                  <div className="text-[13px] text-[#7a766d] py-3">{locale === 'fr' ? 'recherche…' : 'searching…'}</div>
                ) : searchResults.length === 0 ? (
                  <div className="text-[13px] text-[#7a766d] py-3">{locale === 'fr' ? 'aucun atelier trouvé' : 'no workshop found'}</div>
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
                        className="cursor-pointer rounded-2xl overflow-hidden bg-white/90 border border-[#2d2a24]/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)] flex flex-col"
                      >
                        <div className="relative h-[90px]" style={coverStyleFor(w.id, w.cover_gradient, w.cover_image_url, w.cover_image_active)}>
                          <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{emojiFor(w.id, w.emoji)}</div>
                        </div>
                        <div className="px-3.5 pt-3 pb-3.5">
                          <div className="font-medium text-[#2d2a24] text-sm mb-1">{w.name}</div>
                          <div className="text-[11.5px] text-[#7a766d] flex items-center gap-1.5">
                            <Users className="w-3 h-3" />
                            {w.member_count} {locale === 'fr' ? 'membres' : 'members'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            <div className="text-[13px] font-medium text-[#2d2a24] mb-3.5 mt-3">{locale === 'fr' ? 'proposés par Culture' : 'offered by Culture'}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {cultureModulesToShow.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setPreview(moduleToPreview(m))}
                  className="cursor-pointer rounded-2xl overflow-hidden bg-white/90 border border-[#2d2a24]/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)] flex flex-col"
                >
                  <div className="relative h-[90px]" style={{ background: TONE_CSS[m.tone] }}>
                    <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{m.emoji}</div>
                  </div>
                  <div className="px-3.5 pt-3 pb-3.5">
                    <div className="font-medium text-[#2d2a24] text-sm mb-1">{m.name}</div>
                    <div className="text-[11.5px] text-[#7a766d] flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      {m.members.toLocaleString('fr')} {locale === 'fr' ? 'membres' : 'members'}
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
              <div className="w-16 h-16 rounded-2xl bg-[#7a9968]/15 flex items-center justify-center mb-4">
                <Sprout className="w-8 h-8 text-[#4f6b40]" />
              </div>
              <h3 className="text-[15px] font-medium text-[#2d2a24] mb-2">
                {locale === 'fr' ? 'aucun atelier pour le moment' : 'no workshops yet'}
              </h3>
              <p className="text-[#7a766d] text-[13px] mb-6 max-w-xs">
                {locale === 'fr'
                  ? 'créez votre premier atelier ou rejoignez-en un existant via la recherche.'
                  : 'create your first workshop or join one via search.'}
              </p>
              <Link href={`/${locale}/workshops/new`} className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#4f6b40] text-[#f4f0e6] text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)]">
                <Plus className="w-4 h-4" />
                {locale === 'fr' ? 'créer un atelier' : 'create a workshop'}
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {/* owned */}
              <section>
                <div className="flex items-center gap-2 mb-3.5">
                  <Crown className="w-4 h-4 text-[#a87a3a]" />
                  <h2 className="text-[13px] font-medium text-[#2d2a24]">{locale === 'fr' ? 'mes ateliers' : 'my workshops'}</h2>
                  <span className="text-[12px] text-[#9a948a]">({ownedWorkshops.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {ownedWorkshops.map((w) => (
                    <WorkshopCard key={w.id} workshop={w} locale={locale} onExpand={() => setPreview(workshopToPreview(w))} />
                  ))}
                  <Link
                    href={`/${locale}/workshops/new`}
                    className="rounded-2xl border border-dashed border-[#2d2a24]/[0.18] flex flex-col items-center justify-center gap-2 text-[#9a948a] hover:text-[#4f6b40] hover:border-[#4f6b40]/40 transition min-h-[160px]"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-[12.5px] font-medium">{locale === 'fr' ? 'nouvel atelier' : 'new workshop'}</span>
                  </Link>
                </div>
              </section>

              {/* joined + invitations */}
              {(joinedWorkshops.length > 0 || invitations.length > 0) && (
                <section>
                  <div className="flex items-center gap-2 mb-3.5">
                    <BookMarked className="w-4 h-4 text-[#7a9968]" />
                    <h2 className="text-[13px] font-medium text-[#2d2a24]">{locale === 'fr' ? 'ateliers rejoints' : 'joined workshops'}</h2>
                    <span className="text-[12px] text-[#9a948a]">({joinedWorkshops.length})</span>
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
                    <Trash2 className="w-4 h-4 text-[#b85a4a]" />
                    <h2 className="text-[13px] font-medium text-[#2d2a24]">{locale === 'fr' ? 'corbeille' : 'trash'}</h2>
                    <span className="text-[12px] text-[#9a948a]">({trashedWorkshops.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {trashedWorkshops.map((w) => (
                      <div key={w.id} className="rounded-2xl border border-[#b85a4a]/20 bg-white/60 p-4 opacity-80">
                        <div className="font-medium text-[#7a766d] text-sm line-through mb-2">{w.name}</div>
                        <p className="text-[11.5px] text-[#a87a3a] mb-3">
                          {w.days_remaining > 0
                            ? (locale === 'fr' ? `suppression définitive dans ${w.days_remaining} jour(s)` : `permanently deleted in ${w.days_remaining} day(s)`)
                            : (locale === 'fr' ? 'suppression imminente' : 'deletion imminent')}
                        </p>
                        <button
                          onClick={() => handleRestore(w.id)}
                          disabled={restoringId === w.id}
                          className="flex items-center gap-2 text-[12px] font-medium text-[#4f6b40] hover:text-[#3f5630] disabled:opacity-50"
                        >
                          {restoringId === w.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{locale === 'fr' ? 'restauration…' : 'restoring…'}</>
                            : <><RotateCcw className="w-3.5 h-3.5" />{locale === 'fr' ? 'restaurer' : 'restore'}</>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d2a24]/50 backdrop-blur-sm p-4" onClick={closePreview}>
          <div className="w-full max-w-2xl rounded-[20px] bg-[#fcf9f2] shadow-[0_30px_80px_rgba(45,42,36,0.25)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {previewLoading && !preview ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="w-6 h-6 animate-spin text-[#7a766d]" />
              </div>
            ) : preview && (
              <>
                <div className="relative h-[180px]" style={preview.coverStyle}>
                  <div className="absolute left-4 bottom-4 w-11 h-11 rounded-xl bg-white/90 flex items-center justify-center shadow-md text-xl">{preview.emoji}</div>
                  <button onClick={closePreview} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center text-[#5a564c] hover:bg-white">
                    <X className="w-4 h-4" />
                  </button>
                  {(preview.role || preview.isPremium || preview.isInvitation) && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      {preview.isInvitation && (
                        <span
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1"
                          style={{ background: 'rgba(168,122,58,0.92)', color: '#fff' }}
                        >
                          <Mail className="w-3 h-3" /> invitation
                        </span>
                      )}
                      {preview.role && (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/85 text-[#5a564c] font-medium">
                          {preview.role === 'owner'
                            ? (locale === 'fr' ? 'propriétaire' : 'owner')
                            : preview.role === 'manager'
                            ? (locale === 'fr' ? 'gestionnaire' : 'manager')
                            : (locale === 'fr' ? 'membre' : 'member')}
                        </span>
                      )}
                      {preview.isPremium && (
                        <span
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                          style={{ background: 'rgba(232,184,108,0.85)', color: '#7a4d20' }}
                        >
                          Premium
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <h2 className="text-[20px] font-medium text-[#2d2a24] mb-1.5">{preview.name}</h2>
                  <div className="flex items-center gap-2 text-[12.5px] text-[#7a766d] mb-4">
                    <Users className="w-3.5 h-3.5" />
                    <span>{preview.memberCount.toLocaleString('fr')} {locale === 'fr' ? 'membres' : 'members'}</span>
                    <span className="w-[2px] h-[2px] rounded-full bg-[#7a766d]" />
                    <span>{locale === 'fr' ? 'créé par' : 'created by'} {preview.ownerName}</span>
                  </div>
                  {preview.description && (
                    <p className="text-[13.5px] text-[#3a352c] leading-relaxed mb-5">{preview.description}</p>
                  )}

                  {preview.isInvitation ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleAcceptInvitation(preview.id)}
                        disabled={acceptingId === preview.id || decliningId === preview.id}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#4f6b40] text-[#f4f0e6] text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)] disabled:opacity-60"
                      >
                        {acceptingId === preview.id
                          ? <><Loader2 className="w-4 h-4 animate-spin" />{locale === 'fr' ? 'acceptation…' : 'accepting…'}</>
                          : <><Check className="w-4 h-4" />{locale === 'fr' ? 'accepter l\'invitation' : 'accept invitation'}</>}
                      </button>
                      <button
                        onClick={() => handleDeclineInvitation(preview.id)}
                        disabled={acceptingId === preview.id || decliningId === preview.id}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] border border-[#b85a4a]/40 text-[#b85a4a] text-[13.5px] font-medium hover:bg-[#b85a4a]/[0.06] disabled:opacity-60"
                      >
                        {decliningId === preview.id
                          ? <><Loader2 className="w-4 h-4 animate-spin" />{locale === 'fr' ? 'refus…' : 'declining…'}</>
                          : <>{locale === 'fr' ? 'refuser' : 'decline'}</>}
                      </button>
                    </div>
                  ) : preview.isMock ? (
                    <Link href={`/${locale}/dashboard`} onClick={closePreview} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#4f6b40] text-[#f4f0e6] text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)]">
                      {locale === 'fr' ? 'rejoindre l\'atelier' : 'join the workshop'} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : preview.isMember ? (
                    <Link href={`/${locale}/workshops/${preview.id}`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#2d2a24] text-[#f4f0e6] text-[13.5px] font-medium">
                      {locale === 'fr' ? 'entrer dans l\'atelier' : 'enter the workshop'} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : preview.hasRequested ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#a87a3a]/[0.12] text-[#a87a3a] text-[13.5px] font-medium">
                        <Check className="w-4 h-4" />{locale === 'fr' ? 'demande envoyée' : 'request sent'}
                      </span>
                      <span className="text-[12px] text-[#7a766d]">
                        {locale === 'fr'
                          ? 'en attente de validation par un gestionnaire de l\'atelier.'
                          : 'waiting for a workshop manager to approve.'}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRequestJoin(preview.id)}
                      disabled={joiningId === preview.id}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#4f6b40] text-[#f4f0e6] text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)] disabled:opacity-60"
                    >
                      {joiningId === preview.id
                        ? <><Loader2 className="w-4 h-4 animate-spin" />{locale === 'fr' ? 'envoi…' : 'sending…'}</>
                        : <>{locale === 'fr' ? 'demander à rejoindre' : 'request to join'} <ArrowRight className="w-4 h-4" /></>}
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
  const coverStyle = coverStyleFor(workshop.id, workshop.cover_gradient, workshop.cover_image_url, workshop.cover_image_active);
  return (
    <Link href={`/${locale}/workshops/${workshop.id}`} className="group rounded-2xl overflow-hidden bg-white/90 border border-[#2d2a24]/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)] hover:shadow-[0_10px_28px_rgba(45,42,36,0.12)] hover:-translate-y-0.5 transition flex flex-col">
      <div className="relative h-[90px]" style={coverStyle}>
        <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{emojiFor(workshop.id, workshop.emoji)}</div>
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1">
          {workshop.is_premium && (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-semibold shadow-sm"
              style={{ background: 'rgba(232,184,108,0.92)', color: '#7a4d20' }}
            >
              <Crown className="w-2.5 h-2.5" /> Premium
            </span>
          )}
          {workshop.role === 'manager' && (
            <span
              className="inline-flex items-center text-[10.5px] px-2 py-0.5 rounded-full font-semibold shadow-sm"
              style={{ background: 'rgba(122,153,104,0.92)', color: '#27331c' }}
            >
              gestionnaire
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExpand(); }}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/0 group-hover:bg-white/85 flex items-center justify-center text-transparent group-hover:text-[#5a564c] transition"
          aria-label="agrandir"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3.5 pt-3 pb-3.5">
        <div className="font-medium text-[#2d2a24] text-sm mb-1 line-clamp-2">{workshop.name}</div>
        <div className="text-[11.5px] text-[#7a766d] flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          {workshop.member_count} {locale === 'fr' ? 'membres' : 'members'}
        </div>
      </div>
    </Link>
  );
}

function InvitationCard({ workshop, locale, onOpen }: { workshop: WorkshopCardData; locale: string; onOpen: () => void }) {
  const coverStyle = coverStyleFor(workshop.id, workshop.cover_gradient, workshop.cover_image_url, workshop.cover_image_active);
  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-2xl overflow-hidden bg-white/90 border-2 border-[#a87a3a]/45 shadow-[0_4px_16px_rgba(168,122,58,0.12)] hover:shadow-[0_10px_28px_rgba(168,122,58,0.18)] hover:-translate-y-0.5 transition flex flex-col"
    >
      <div className="relative h-[90px]" style={coverStyle}>
        <div className="absolute left-3.5 bottom-3 w-[38px] h-[38px] rounded-xl bg-white/90 flex items-center justify-center shadow-md text-lg">{emojiFor(workshop.id, workshop.emoji)}</div>
        <span
          className="absolute top-2.5 left-2.5 text-[10.5px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
          style={{ background: 'rgba(168,122,58,0.92)', color: '#fff' }}
        >
          <Mail className="w-2.5 h-2.5" /> invitation
        </span>
      </div>
      <div className="px-3.5 pt-3 pb-3.5">
        <div className="font-medium text-[#2d2a24] text-sm mb-1 line-clamp-2">{workshop.name}</div>
        <div className="text-[11.5px] text-[#a87a3a] font-medium truncate">
          {locale === 'fr' ? 'invité par' : 'invited by'} {workshop.owner_name}
        </div>
      </div>
    </button>
  );
}
