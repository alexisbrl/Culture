'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PencilLine } from 'lucide-react';

const QUESTION = {
  n: 4,
  total: 12,
  section: '03 · Mitochondrie & respiration',
  workshop: 'Biologie cellulaire',
  text: "Quelle structure cellulaire est responsable de la production majoritaire d'ATP par phosphorylation oxydative ?",
  options: [
    { id: 'a', label: 'Le réticulum endoplasmique rugueux', correct: false },
    { id: 'b', label: 'La mitochondrie', correct: true },
    { id: 'c', label: "L'appareil de Golgi", correct: false },
    { id: 'd', label: 'Le noyau', correct: false },
  ],
  difficulty: 6,
  bloom: 'Remember',
};

export default function SessionPage() {
  const locale = useLocale();
  const fr = locale === 'fr';
  const { id } = useParams<{ id: string }>();
  const [selected, setSelected] = useState<string | null>('b');
  const [status, setStatus] = useState<'idle' | 'submitted'>('idle');
  const pct = 41;

  return (
    <div className="h-[calc(100vh-4rem)] bg-[#fcf9f2] font-sans flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#2d2a24]/[0.07] bg-white/70 backdrop-blur shrink-0">
        <Link href={`/${locale}/workshops/${id}`} className="text-[12.5px] text-[#5a564c] flex items-center gap-1.5 hover:text-[#2d2a24]">
          <ArrowLeft className="w-3.5 h-3.5" /> {fr ? 'quitter la session' : 'leave session'}
        </Link>
        <span className="text-[12.5px] text-[#7a766d] hidden sm:block">{QUESTION.workshop} · {QUESTION.section}</span>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#7a766d]">{QUESTION.n - 1}/{QUESTION.total}</span>
          <div className="flex gap-[3px]">
            {Array.from({ length: QUESTION.total }, (_, i) => (
              <div key={i} className="w-2 h-3 rounded-full" style={{ background: i < QUESTION.n - 1 ? '#7a9968' : 'rgba(45,42,36,0.10)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] min-h-0">
        {/* plant rail */}
        <div className="relative overflow-hidden hidden md:flex flex-col items-center px-[22px] py-7 bg-gradient-to-b from-[#eef0dd] via-[#e3ead7] to-[#d8e6cf]">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full" style={{ background: 'radial-gradient(circle, rgba(246,201,112,0.3), rgba(246,201,112,0) 70%)' }} />
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#7a766d] mb-1">{fr ? 'tu arroses' : 'you water'}</div>
          <div className="text-[15px] font-medium text-[#2d2a24] text-center">Biologie cellulaire</div>
          <div className="font-script text-base text-[#a87a3a] mb-2">{fr ? '« buisson · niv. 2 »' : '“shrub · lvl. 2”'}</div>
          <div className="relative w-[170px] h-[150px] mt-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/trees/paulownia-3.png" alt="" className="absolute inset-0 w-full h-full object-contain" />
          </div>
          <div className="w-full max-w-[200px] mt-auto">
            <div className="flex justify-between text-[11px] text-[#7a766d] mb-1.5">
              <span>{fr ? 'niveau 2' : 'level 2'}</span>
              <span className="text-[#3f5630]">{fr ? '+8 % si ≥ 9/12' : '+8% if ≥ 9/12'}</span>
            </div>
            <div className="h-2 rounded-full bg-[#2d2a24]/[0.08] overflow-hidden relative">
              <div className="h-full bg-[#7a9968]" style={{ width: `${pct}%` }} />
              <div className="absolute top-0 bottom-0 w-[2px] bg-[#3f5630]" style={{ left: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-[#7a766d] mt-1.5 text-center">{pct} % · {fr ? 'chaque bonne réponse = 1 goutte' : 'each correct answer = 1 drop'}</div>
          </div>
        </div>

        {/* QCM */}
        <div className="flex flex-col min-h-0">
          <div className="flex-1 overflow-auto px-6 md:px-[52px] py-8">
            <div className="max-w-[720px] mx-auto">
              <div className="flex items-center gap-2 mb-[18px] flex-wrap">
                <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-[#2d2a24]/[0.05] text-[#5a564c] tabular-nums">question {QUESTION.n} / {QUESTION.total}</span>
                <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-[#2d2a24]/[0.05] text-[#5a564c]">{fr ? 'difficulté' : 'difficulty'} {QUESTION.difficulty}/10</span>
                <span className="text-[11.5px] px-2.5 py-1 rounded-full bg-[#2d2a24]/[0.05] text-[#5a564c]">Bloom · {QUESTION.bloom}</span>
              </div>

              <div className="text-[27px] leading-[1.35] text-[#2d2a24] mb-[30px] tracking-tight font-medium text-pretty">{QUESTION.text}</div>

              <div className="flex flex-col gap-3">
                {QUESTION.options.map((opt, i) => {
                  const letter = ['A', 'B', 'C', 'D'][i];
                  const isSel = selected === opt.id;
                  let cls = 'border-[#2d2a24]/[0.12] bg-white/90';
                  let icon: string | null = null;
                  if (status === 'submitted') {
                    if (opt.correct) { cls = 'border-[1.5px] border-[#4f6b40]/45 bg-[#7a9968]/[0.16]'; icon = '✓'; }
                    else if (isSel) { cls = 'border-[1.5px] border-[#b85a4a]/40 bg-[#b85a4a]/10'; icon = '·'; }
                  } else if (isSel) {
                    cls = 'border-[1.5px] border-[#a87a3a]/45 bg-[#e8b86c]/[0.16]';
                  }
                  return (
                    <div
                      key={opt.id}
                      onClick={() => status === 'idle' && setSelected(opt.id)}
                      className={`flex items-center gap-4 px-5 py-[18px] rounded-[14px] border cursor-pointer transition ${cls}`}
                    >
                      <div className="w-8 h-8 rounded-full border border-[#2d2a24]/[0.14] bg-white flex items-center justify-center text-[13px] font-medium text-[#5a564c] shrink-0">{letter}</div>
                      <div className="flex-1 text-base text-[#2d2a24] leading-snug">{opt.label}</div>
                      {icon && <div className="text-base" style={{ color: opt.correct ? '#3f5630' : '#9a4d3a' }}>{icon}</div>}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 px-4 py-3 border border-dashed border-[#2d2a24]/[0.18] rounded-[10px] flex items-center gap-2.5 bg-white/50">
                <PencilLine className="w-4 h-4 text-[#a87a3a]" />
                <div className="flex-1 text-[13px] text-[#7a766d]">
                  <span className="font-script text-[15px] text-[#a87a3a]">{fr ? '« demande un indice à l’IA »' : '“ask the AI for a hint”'}</span> · {fr ? 'échange premium' : 'premium feature'}
                </div>
              </div>
            </div>
          </div>

          {/* footer CTA */}
          <div className="px-6 md:px-[52px] py-4 border-t border-[#2d2a24]/[0.07] bg-white/60 shrink-0">
            <div className="max-w-[720px] mx-auto flex gap-2.5">
              <button className="px-[18px] py-3.5 rounded-xl bg-transparent border border-[#2d2a24]/[0.16] text-[#5a564c] text-sm">{fr ? 'passer' : 'skip'}</button>
              <button
                onClick={() => setStatus(status === 'idle' ? 'submitted' : 'idle')}
                className="flex-1 px-[18px] py-3.5 rounded-xl text-[#f4f0e6] text-[15px] font-medium shadow-[0_8px_20px_rgba(79,107,64,0.28)] transition"
                style={{ background: status === 'submitted' ? '#4f6b40' : '#7a9968' }}
              >
                {status === 'submitted' ? (fr ? 'question suivante →' : 'next question →') : (fr ? 'valider et arroser →' : 'submit and water →')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
