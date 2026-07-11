'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Upload, FileText, X, ChevronRight } from 'lucide-react';

const FILES = [
  { name: 'cours_bio_L2_S1.pdf', size: '2.4 Mo', pages: 48 },
  { name: 'mitochondrie_chap3.pdf', size: '1.8 Mo', pages: 32 },
  { name: 'TD-cytosquelette.pdf', size: '780 Ko', pages: 12 },
];

export default function CreatePage() {
  const locale = useLocale();
  const t = useTranslations('createWorkshop');

  return (
    <div className="min-h-[calc(100vh-65px)] bg-cream font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* breadcrumb + header */}
        <div className="text-[11px] text-ink-soft mb-1">
          {t('breadcrumb.garden')} ›{' '}
          <span className="text-ink">{t('breadcrumb.newPlot')}</span>
        </div>
        <div className="mb-6">
          <h1 className="text-[27px] font-medium text-ink tracking-tight">
            {t('title')}
          </h1>
          <p className="font-script text-[19px] text-amber mt-1">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
          {/* MAIN — source */}
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-soft mb-2.5">
              {t('source.kicker')}
            </div>

            <div className="rounded-[18px] border-2 border-dashed border-amber/45 bg-gradient-to-b from-[#e8d8a8]/20 to-cream/60 px-8 py-10 text-center mb-3.5">
              <div className="mx-auto mb-3.5 w-16 h-16 rounded-2xl bg-white border border-ink/10 flex items-center justify-center shadow-sm">
                <Upload className="w-7 h-7 text-amber" />
              </div>
              <div className="text-lg text-ink font-medium">
                {t('source.dropHere')}
              </div>
              <div className="font-script text-base text-amber mt-1">
                {t('source.dropTagline')}
              </div>
              <button className="mt-4 px-5 py-2.5 rounded-[10px] bg-amber text-parchment text-[13.5px] font-medium shadow-[0_6px_16px_rgba(168,122,58,0.28)] hover:brightness-105 transition">
                {t('source.browseFiles')}
              </button>
              <div className="mt-4 text-[11.5px] text-ink-soft">
                {t('source.formatPrefix')}
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-ink/[0.06]">.pdf</span>
                {t('source.formatSuffix')}
                <span className="mx-1.5 text-[#cbc6bb]">·</span>
                <span className="text-ink-faint">
                  {t('source.futureFormats')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-ink-soft">{t('source.filesAdded', { count: FILES.length })}</span>
              <span className="text-[11.5px] text-ink-faint">
                {t('source.extractAfterCreation')}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {FILES.map((f) => (
                <div key={f.name} className="flex items-center gap-3 px-3 py-2.5 bg-white/80 border border-ink/[0.07] rounded-[10px]">
                  <FileText className="w-6 h-7 text-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink font-medium truncate">{f.name}</div>
                    <div className="text-[11px] text-ink-soft mt-0.5">{f.size} · {f.pages} pages</div>
                  </div>
                  <X className="w-4 h-4 text-ink-ghost cursor-pointer hover:text-ink-soft" />
                </div>
              ))}
            </div>
          </div>

          {/* SIDE — identity */}
          <div className="flex flex-col gap-3.5 lg:sticky lg:top-4">
            <div className="bg-white/85 border border-ink/[0.08] rounded-[14px] px-[18px] py-4">
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-soft mb-3">
                {t('identity.kicker')}
              </div>
              <div className="w-full h-[92px] rounded-[10px] overflow-hidden relative mb-3 bg-gradient-to-br from-[#cfd9c0] to-[#a8b896]">
                <div className="absolute bottom-2 right-2 text-[10px] text-white bg-ink/50 px-2 py-[3px] rounded-md cursor-pointer">
                  {t('identity.changeCover')}
                </div>
              </div>
              <div className="text-[10.5px] text-ink-soft mb-1">{t('identity.nameLabel')}</div>
              <input
                placeholder={t('identity.namePlaceholder')}
                className="w-full px-3 py-2.5 border border-ink/[0.14] rounded-lg text-[13px] bg-white text-ink mb-3 outline-none focus:border-amber/50"
              />
              <div className="text-[10.5px] text-ink-soft mb-1">{t('identity.descriptionLabel')}</div>
              <textarea
                placeholder={t('identity.descriptionPlaceholder')}
                className="w-full px-3 py-2.5 border border-ink/[0.14] rounded-lg text-[12.5px] bg-white text-ink h-14 resize-none leading-snug outline-none focus:border-amber/50"
              />
            </div>

            <Link
              href={`/${locale}/dashboard`}
              className="px-[18px] py-3.5 rounded-xl bg-green text-parchment text-center text-[14.5px] font-medium shadow-[0_8px_22px_rgba(79,107,64,0.30)] hover:brightness-105 transition inline-flex items-center justify-center gap-1.5"
            >
              {t('createCta')} <ChevronRight className="w-4 h-4" />
            </Link>
            <div className="text-[11px] text-ink-faint text-center">
              {t('extractHint')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
