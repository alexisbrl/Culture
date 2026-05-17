'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, BookOpen, Users, Crown, BookMarked, X, ArrowRight, Clock } from 'lucide-react';
import { searchWorkshops, joinWorkshop } from '@/app/actions/workshops';

type Workshop = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
};

type Props = {
  locale: string;
  firstName: string;
  ownedWorkshops: Workshop[];
  joinedWorkshops: Workshop[];
};

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function WorkshopCard({
  workshop,
  role,
  locale,
}: {
  workshop: Workshop;
  role: 'owner' | 'member';
  locale: string;
}) {
  return (
    <Link
      href={`/${locale}/workshops/${workshop.id}`}
      className="group bg-white border border-gray-200 rounded-2xl p-5 hover:border-violet-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 group-hover:text-violet-700 transition-colors leading-snug line-clamp-2">
          {workshop.name}
        </h3>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
            role === 'owner'
              ? 'bg-violet-100 text-violet-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {role === 'owner'
            ? locale === 'fr' ? 'Propriétaire' : 'Owner'
            : locale === 'fr' ? 'Membre' : 'Member'}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {workshop.member_count} {locale === 'fr' ? 'membre(s)' : 'member(s)'}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {formatDate(workshop.created_at, locale)}
        </span>
      </div>

      <div className="flex items-center gap-1 text-xs text-violet-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        {locale === 'fr' ? 'Ouvrir' : 'Open'}
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

function EmptyState({ locale, onCreateClick }: { locale: string; onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
        <BookOpen className="w-10 h-10 text-violet-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {locale === 'fr' ? 'Aucun atelier pour le moment' : 'No workshops yet'}
      </h3>
      <p className="text-gray-500 text-sm mb-6 max-w-xs">
        {locale === 'fr'
          ? 'Créez votre premier atelier ou rejoignez-en un existant via la barre de recherche.'
          : 'Create your first workshop or join an existing one via the search bar.'}
      </p>
      <button
        onClick={onCreateClick}
        className="flex items-center gap-2 px-5 py-2.5 gradient-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity shadow-md"
      >
        <Plus className="w-4 h-4" />
        {locale === 'fr' ? 'Créer un atelier' : 'Create a workshop'}
      </button>
    </div>
  );
}

export default function DashboardClient({ locale, firstName, ownedWorkshops, joinedWorkshops }: Props) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; created_at: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasWorkshops = ownedWorkshops.length > 0 || joinedWorkshops.length > 0;

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await searchWorkshops(query);
    setSearchResults(results as Array<{ id: string; name: string; created_at: string }>);
    setIsSearching(false);
  }

  async function handleJoin(workshopId: string) {
    setJoiningId(workshopId);
    const result = await joinWorkshop(workshopId);
    if (result.success) {
      setSearchQuery('');
      setSearchResults([]);
      router.refresh();
    }
    setJoiningId(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {locale === 'fr' ? `Bonjour, ${firstName} 👋` : `Hello, ${firstName} 👋`}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {locale === 'fr' ? 'Gérez vos ateliers d\'apprentissage' : 'Manage your learning workshops'}
              </p>
            </div>

            <Link
              href={`/${locale}/workshops/new`}
              className="flex items-center gap-2 px-5 py-2.5 gradient-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity shadow-md whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              {locale === 'fr' ? 'Créer un atelier' : 'Create a workshop'}
            </Link>
          </div>

          {/* Search bar */}
          <div className="relative mt-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={locale === 'fr' ? 'Rechercher un atelier à rejoindre...' : 'Search for a workshop to join...'}
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Search results dropdown */}
            {(searchResults.length > 0 || (isSearching && searchQuery)) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {isSearching ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    {locale === 'fr' ? 'Recherche...' : 'Searching...'}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    {locale === 'fr' ? 'Aucun atelier trouvé' : 'No workshops found'}
                  </div>
                ) : (
                  searchResults.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{w.name}</p>
                        <p className="text-xs text-gray-500">{formatDate(w.created_at, locale)}</p>
                      </div>
                      <button
                        onClick={() => handleJoin(w.id)}
                        disabled={joiningId === w.id}
                        className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        {joiningId === w.id
                          ? locale === 'fr' ? 'Rejoindre...' : 'Joining...'
                          : locale === 'fr' ? 'Rejoindre' : 'Join'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!hasWorkshops ? (
          <EmptyState locale={locale} onCreateClick={() => router.push(`/${locale}/workshops/new`)} />
        ) : (
          <div className="space-y-10">
            {/* Owned workshops */}
            {ownedWorkshops.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-5 h-5 text-violet-600" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {locale === 'fr' ? 'Mes ateliers' : 'My workshops'}
                  </h2>
                  <span className="text-sm text-gray-400">({ownedWorkshops.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ownedWorkshops.map((w) => (
                    <WorkshopCard key={w.id} workshop={w} role="owner" locale={locale} />
                  ))}
                  {/* Add new card */}
                  <Link
                    href={`/${locale}/workshops/new`}
                    className="border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50/50 transition-all duration-200 min-h-[120px]"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-sm font-medium">
                      {locale === 'fr' ? 'Nouvel atelier' : 'New workshop'}
                    </span>
                  </Link>
                </div>
              </section>
            )}

            {/* Joined workshops */}
            {joinedWorkshops.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <BookMarked className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {locale === 'fr' ? 'Ateliers rejoints' : 'Joined workshops'}
                  </h2>
                  <span className="text-sm text-gray-400">({joinedWorkshops.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {joinedWorkshops.map((w) => (
                    <WorkshopCard key={w.id} workshop={w} role="member" locale={locale} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
