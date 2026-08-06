'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import { createWorkshop } from '@/app/actions/workshops';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function WorkshopNewClient({ locale }: { locale: string }) {
  const t = useTranslations('workshopNew');
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
      setError(result.error ?? t('err.create'));
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-60px)] bg-[var(--surface-page)] flex flex-col">
      {/* Header */}
      <div className="bg-[var(--ink)] text-[var(--on-ink)] py-16">
        <div className="max-w-2xl mx-auto px-4">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-2 text-[var(--on-ink)]/70 hover:text-[var(--on-ink)] text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToDashboard')}
          </Link>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--on-ink)]/10 border border-[var(--on-ink)]/20 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-[var(--on-ink)]" />
            </div>
            <span className="text-sm font-medium text-[var(--on-ink)] bg-[var(--on-ink)]/10 px-3 py-1 rounded-full border border-[var(--on-ink)]/20">
              {t('badge')}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            {t('title')}
          </h1>
          <p className="text-[var(--on-ink)]/70 text-base max-w-lg">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="bg-[var(--surface-raised)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-sm)] w-full max-w-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name" className="mb-2">
                {t('nameLabel')}
                <span className="text-[var(--danger)]">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                maxLength={100}
                autoFocus
                disabled={isLoading}
              />
              <p className="text-xs text-[var(--text-faint)] mt-1.5 text-right">{name.length}/100</p>
            </div>

            {error && (
              <div className="bg-[var(--danger-tint)] border border-[var(--danger)]/30 rounded-[var(--radius-sm)] px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Link href={`/${locale}/dashboard`} className="flex-1">
                <Button type="button" variant="ghost" className="w-full">
                  {t('cancel')}
                </Button>
              </Link>
              <Button type="submit" disabled={!name.trim() || isLoading} className="flex-1">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('creating')}
                  </>
                ) : (
                  t('create')
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
