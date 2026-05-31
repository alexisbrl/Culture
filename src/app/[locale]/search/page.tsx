'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Search, X } from 'lucide-react';

type Tone = 'amber' | 'sky' | 'sage' | 'wood';
const TONE_BG: Record<Tone, string> = {
  amber: 'from-[#e8d8a8] to-[#c89860]',
  sky: 'from-[#c7d4d8] to-[#9eb3b9]',
  sage: 'from-[#cfd9c0] to-[#a8b896]',
  wood: 'from-[#cbb79a] to-[#a08a72]',
};

const MODULES = [
  { id: 'cuisine', name: 'Cuisine du soir', tone: 'amber' as Tone, emoji: '🍳', members: 4820, briques: 142, level: 'tous niveaux', desc: 'Apprends à improviser un dîner complet à partir de ce que tu as : techniques de base, accords de saveurs, et 40 recettes décomposées en gestes simples.' },
  { id: 'astro', name: 'Astronomie pour curieux', tone: 'sky' as Tone, emoji: '✦', members: 2140, briques: 88, level: 'débutant', desc: 'Du système solaire aux galaxies lointaines : repère les constellations, comprends les saisons, et lis le ciel à l’œil nu sans jargon.' },
  { id: 'jardin', name: 'Jardin de balcon', tone: 'sage' as Tone, emoji: '🌿', members: 1208, briques: 64, level: 'débutant', desc: 'Faire pousser herbes, fleurs et légumes dans un mètre carré : choix des plantes, arrosage, lumière, et calendrier des semis.' },
  { id: 'oeno', name: 'Œnologie · introduction', tone: 'wood' as Tone, emoji: '◐', members: 980, briques: 110, level: 'intermédiaire', desc: 'Déguster avec méthode : cépages, terroirs, vocabulaire, et accords mets-vins — pour parler vin sans prétention.' },
];

export default function SearchPage() {
  const locale = useLocale();
  const fr = locale === 'fr';
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#eef6e2] via-[#e4efd4] to-[#d6e7cf] font-sans px-6 lg:px-10 py-8">
      <div className="max-w-6xl mx-auto rounded-[20px] bg-[#fcf9f2]/92 backdrop-blur-xl border border-[#2d2a24]/[0.07] shadow-[0_40px_90px_rgba(45,42,36,0.16)] overflow-hidden flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-7 pt-5">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#7a766d] mb-1">{fr ? 'explorer' : 'explore'}</div>
            <div className="text-[23px] font-medium text-[#2d2a24] tracking-tight">{fr ? 'de nouvelles graines à planter.' : 'new seeds to plant.'}</div>
          </div>
          <Link href={`/${locale}/garden`} className="w-8 h-8 rounded-full bg-[#2d2a24]/[0.06] flex items-center justify-center text-[#5a564c] hover:bg-[#2d2a24]/10">
            <X className="w-4 h-4" />
          </Link>
        </div>

        {/* search */}
        <div className="px-7 pt-4">
          <div className="flex items-center gap-3 px-[18px] py-3 bg-white rounded-[14px] border border-[#2d2a24]/[0.08] shadow-[0_6px_22px_rgba(45,42,36,0.06)]">
            <Search className="w-[18px] h-[18px] text-[#7a766d]" />
            <input
              placeholder={fr ? 'rechercher par nom, matière ou tag…' : 'search by name, subject or tag…'}
              className="flex-1 bg-transparent outline-none text-[15px] text-[#2d2a24]"
            />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2d2a24]/[0.06] text-[#5a564c] font-mono">esc</span>
          </div>
        </div>

        {/* modules */}
        <div className="px-7 pt-5 pb-6">
          <div className="flex items-baseline justify-between mb-3.5">
            <div className="text-[13px] font-medium text-[#2d2a24]">{fr ? 'proposés par Culture' : 'offered by Culture'}</div>
            <div className="font-script text-base text-[#a87a3a]">{fr ? '« nos ateliers loisir, prêts à pousser »' : '“our leisure workshops, ready to grow”'}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {MODULES.map((m) => {
              const isExp = expanded === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setExpanded(isExp ? null : m.id)}
                  className={`cursor-pointer rounded-2xl overflow-hidden bg-white/90 transition ${
                    isExp
                      ? 'lg:col-span-4 grid grid-cols-1 lg:grid-cols-[300px_1fr] border-[1.5px] border-[#a87a3a]/40 shadow-[0_16px_44px_rgba(45,42,36,0.14)]'
                      : 'flex flex-col border border-[#2d2a24]/[0.08] shadow-[0_4px_16px_rgba(45,42,36,0.06)]'
                  }`}
                >
                  <div className={`relative bg-gradient-to-br ${TONE_BG[m.tone]} ${isExp ? 'min-h-[180px]' : 'h-[124px]'}`}>
                    <span className="absolute top-2.5 right-2.5 text-[10px] px-2 py-0.5 rounded-full bg-white/80 text-[#5a6b3e] font-medium">{fr ? 'proposé par Culture' : 'by Culture'}</span>
                    <div className={`absolute left-3.5 bottom-3 rounded-xl bg-white/90 flex items-center justify-center shadow-md ${isExp ? 'w-12 h-12 text-2xl' : 'w-[38px] h-[38px] text-lg'}`}>{m.emoji}</div>
                  </div>
                  <div className={isExp ? 'px-[22px] py-5' : 'px-3.5 pt-3 pb-3.5'}>
                    <div className={`font-medium text-[#2d2a24] mb-1 ${isExp ? 'text-[19px]' : 'text-sm'}`}>{m.name}</div>
                    <div className="text-[11.5px] text-[#7a766d] flex items-center gap-2 mb-3">
                      <span>{m.members.toLocaleString('fr')} {fr ? 'membres' : 'members'}</span>
                      <span className="w-[2px] h-[2px] rounded-full bg-[#7a766d]" />
                      <span>{m.briques} {fr ? 'briques' : 'bricks'}</span>
                      <span className="w-[2px] h-[2px] rounded-full bg-[#7a766d]" />
                      <span>{m.level}</span>
                    </div>
                    {isExp ? (
                      <>
                        <div className="text-sm text-[#3a352c] leading-relaxed mb-2 max-w-[620px]">{m.desc}</div>
                        <div className="font-script text-[17px] text-[#a87a3a] mb-[18px]">{fr ? '« gratuit avec ton abonnement Culture »' : '“free with your Culture subscription”'}</div>
                        <div className="flex gap-2.5">
                          <Link href={`/${locale}/dashboard`} onClick={(e) => e.stopPropagation()} className="px-[22px] py-2.5 rounded-[10px] bg-[#4f6b40] text-[#f4f0e6] text-[13.5px] font-medium shadow-[0_6px_16px_rgba(79,107,64,0.28)]">
                            {fr ? 'rejoindre l’atelier →' : 'join the workshop →'}
                          </Link>
                          <button onClick={(e) => e.stopPropagation()} className="px-[18px] py-2.5 rounded-[10px] bg-transparent border border-[#2d2a24]/[0.16] text-[#5a564c] text-[13px]">
                            {fr ? 'aperçu du programme' : 'program preview'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11.5px] text-[#a87a3a]">{fr ? 'cliquer pour en savoir plus →' : 'click to learn more →'}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* tag entry */}
          <div className="mt-5 px-5 py-4 bg-white/60 border border-dashed border-[#2d2a24]/[0.18] rounded-[14px] flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#7a766d] mb-1">{fr ? 'tu as un tag ?' : 'got a tag?'}</div>
              <div className="text-[13.5px] text-[#2d2a24]">{fr ? 'colle-le pour rejoindre directement un atelier privé.' : 'paste it to join a private workshop directly.'}</div>
            </div>
            <input placeholder="A3K9P2M" className="font-mono text-sm px-3.5 py-2.5 rounded-[10px] border border-[#2d2a24]/[0.14] bg-white w-[150px] tracking-wider outline-none focus:border-[#a87a3a]/50" />
            <button className="px-4 py-2.5 rounded-[10px] bg-[#2d2a24] text-[#f4f0e6] text-[13px] font-medium">{fr ? 'rejoindre →' : 'join →'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
