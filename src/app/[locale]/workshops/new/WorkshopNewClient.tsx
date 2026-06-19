'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import { createWorkshop } from '@/app/actions/workshops';

export default function WorkshopNewClient({ locale }: { locale: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');

    const result = await createWorkshop(name.trim());

    if (result.success && result.id) {
      router.push(`/${locale}/workshops/${result.id}`);
    } else {
      setError(result.error ?? (locale === 'fr' ? 'Erreur lors de la création' : 'Error creating workshop'));
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 text-white py-16">
        <div className="max-w-2xl mx-auto px-4">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-2 text-violet-300 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {locale === 'fr' ? 'Retour au tableau de bord' : 'Back to dashboard'}
          </Link>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-violet-300" />
            </div>
            <span className="text-sm font-medium text-violet-300 bg-violet-500/20 px-3 py-1 rounded-full border border-violet-400/20">
              {locale === 'fr' ? 'Nouvel atelier' : 'New workshop'}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            {locale === 'fr' ? 'Créer un atelier' : 'Create a workshop'}
          </h1>
          <p className="text-slate-300 text-base max-w-lg">
            {locale === 'fr'
              ? 'Donnez un nom à votre atelier. Vous pourrez ensuite inviter des membres et ajouter des documents.'
              : 'Give your workshop a name. You can then invite members and add documents.'}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                {locale === 'fr' ? "Nom de l'atelier" : 'Workshop name'}
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  locale === 'fr'
                    ? 'Ex: Formation Excel avancé, Onboarding 2024...'
                    : 'E.g: Advanced Excel Training, Onboarding 2024...'
                }
                maxLength={100}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 transition-all"
                autoFocus
                disabled={isLoading}
              />
              <p className="text-xs text-gray-400 mt-1.5 text-right">{name.length}/100</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Link
                href={`/${locale}/dashboard`}
                className="flex-1 flex items-center justify-center px-5 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {locale === 'fr' ? 'Annuler' : 'Cancel'}
              </Link>
              <button
                type="submit"
                disabled={!name.trim() || isLoading}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 gradient-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {locale === 'fr' ? 'Création...' : 'Creating...'}
                  </>
                ) : (
                  locale === 'fr' ? 'Créer l\'atelier' : 'Create workshop'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
