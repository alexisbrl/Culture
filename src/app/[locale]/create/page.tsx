'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Upload, FileText, X, ChevronRight } from 'lucide-react';

const FILES = [
  { name: 'cours_bio_L2_S1.pdf', size: '2.4 Mo', pages: 48 },
  { name: 'mitochondrie_chap3.pdf', size: '1.8 Mo', pages: 32 },
  { name: 'TD-cytosquelette.pdf', size: '780 Ko', pages: 12 },
];

export default function CreatePage() {
  const locale = useLocale();
  const fr = locale === 'fr';
  const [vis, setVis] = useState<'private' | 'public'>('private');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#fcf9f2] font-sans">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* breadcrumb + header */}
        <div className="text-[11px] text-[#7a766d] mb-1">
          {fr ? 'jardin' : 'garden'} ›{' '}
          <span className="text-[#2d2a24]">{fr ? 'nouvelle parcelle' : 'new plot'}</span>
        </div>
        <div className="mb-6">
          <h1 className="text-[27px] font-medium text-[#2d2a24] tracking-tight">
            {fr ? 'plante une nouvelle matière.' : 'plant a new subject.'}
          </h1>
          <p className="font-script text-[19px] text-[#a87a3a] mt-1">
            {fr
              ? '« dépose tes cours — l’IA fera pousser les briques toute seule. »'
              : '“drop your courses — the AI grows the knowledge bricks for you.”'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
          {/* MAIN — source */}
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#7a766d] mb-2.5">
              {fr ? '① source · le cœur de ton atelier' : '① source · the heart of your workshop'}
            </div>

            <div className="rounded-[18px] border-2 border-dashed border-[#a87a3a]/45 bg-gradient-to-b from-[#e8d8a8]/20 to-[#fcf9f2]/60 px-8 py-10 text-center mb-3.5">
              <div className="mx-auto mb-3.5 w-16 h-16 rounded-2xl bg-white border border-[#2d2a24]/10 flex items-center justify-center shadow-sm">
                <Upload className="w-7 h-7 text-[#a87a3a]" />
              </div>
              <div className="text-lg text-[#2d2a24] font-medium">
                {fr ? 'dépose tes fichiers ici' : 'drop your files here'}
              </div>
              <div className="font-script text-base text-[#a87a3a] mt-1">
                {fr ? '« glisse-dépose, ou colle un lien Drive »' : '“drag & drop, or paste a Drive link”'}
              </div>
              <button className="mt-4 px-5 py-2.5 rounded-[10px] bg-[#a87a3a] text-[#f4f0e6] text-[13.5px] font-medium shadow-[0_6px_16px_rgba(168,122,58,0.28)] hover:brightness-105 transition">
                {fr ? 'parcourir mes fichiers' : 'browse my files'}
              </button>
              <div className="mt-4 text-[11.5px] text-[#7a766d]">
                {fr ? 'format V1 — ' : 'V1 format — '}
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#2d2a24]/[0.06]">.pdf</span>
                {fr ? ' · 25 Mo max / fichier' : ' · 25 MB max / file'}
                <span className="mx-1.5 text-[#cbc6bb]">·</span>
                <span className="text-[#9a948a]">
                  {fr ? 'Word, PowerPoint, audio, vidéo arrivent en V2' : 'Word, PowerPoint, audio, video coming in V2'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#7a766d]">{FILES.length} {fr ? 'fichiers déposés' : 'files added'}</span>
              <span className="text-[11.5px] text-[#9a948a]">
                {fr ? 'l’IA extraira les briques après la création' : 'the AI will extract bricks after creation'}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {FILES.map((f) => (
                <div key={f.name} className="flex items-center gap-3 px-3 py-2.5 bg-white/80 border border-[#2d2a24]/[0.07] rounded-[10px]">
                  <FileText className="w-6 h-7 text-[#a87a3a] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#2d2a24] font-medium truncate">{f.name}</div>
                    <div className="text-[11px] text-[#7a766d] mt-0.5">{f.size} · {f.pages} pages</div>
                  </div>
                  <X className="w-4 h-4 text-[#bdb8ad] cursor-pointer hover:text-[#7a766d]" />
                </div>
              ))}
            </div>
          </div>

          {/* SIDE — identity + visibility */}
          <div className="flex flex-col gap-3.5 lg:sticky lg:top-4">
            <div className="bg-white/85 border border-[#2d2a24]/[0.08] rounded-[14px] px-[18px] py-4">
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#7a766d] mb-3">
                {fr ? '② identité' : '② identity'}
              </div>
              <div className="w-full h-[92px] rounded-[10px] overflow-hidden relative mb-3 bg-gradient-to-br from-[#cfd9c0] to-[#a8b896]">
                <div className="absolute bottom-2 right-2 text-[10px] text-white bg-[#2d2a24]/50 px-2 py-[3px] rounded-md cursor-pointer">
                  {fr ? 'changer la couverture' : 'change cover'}
                </div>
              </div>
              <div className="text-[10.5px] text-[#7a766d] mb-1">{fr ? 'nom' : 'name'}</div>
              <input
                placeholder={fr ? 'ex. Biologie cellulaire — L2' : 'e.g. Cell biology — L2'}
                className="w-full px-3 py-2.5 border border-[#2d2a24]/[0.14] rounded-lg text-[13px] bg-white text-[#2d2a24] mb-3 outline-none focus:border-[#a87a3a]/50"
              />
              <div className="text-[10.5px] text-[#7a766d] mb-1">{fr ? 'description courte' : 'short description'}</div>
              <textarea
                placeholder={fr ? 'une phrase pour situer la matière…' : 'one line to set the scene…'}
                className="w-full px-3 py-2.5 border border-[#2d2a24]/[0.14] rounded-lg text-[12.5px] bg-white text-[#2d2a24] h-14 resize-none leading-snug outline-none focus:border-[#a87a3a]/50"
              />
            </div>

            <div className="bg-white/85 border border-[#2d2a24]/[0.08] rounded-[14px] px-[18px] py-4">
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#7a766d] mb-1">
                {fr ? '③ visibilité' : '③ visibility'}
              </div>
              <div className="text-[11.5px] text-[#9a948a] mb-3">
                {fr ? 'le reste se règle ensuite dans les paramètres.' : 'everything else is set later in settings.'}
              </div>
              <div className="flex flex-col gap-2">
                {([
                  { id: 'private', t: fr ? 'Privé' : 'Private', d: fr ? 'on rejoint via un tag ou une invitation' : 'join via a tag or an invite' },
                  { id: 'public', t: fr ? 'Public' : 'Public', d: fr ? 'visible dans la recherche par tous' : 'visible in search to everyone' },
                ] as const).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setVis(o.id)}
                    className={`flex items-start gap-2.5 text-left px-3 py-2.5 rounded-[10px] transition ${
                      vis === o.id ? 'bg-[#e8b86c]/[0.16] border-[1.5px] border-[#a87a3a]/40' : 'bg-white/60 border border-[#2d2a24]/10'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full mt-0.5 shrink-0 transition"
                      style={{ border: vis === o.id ? '5px solid #a87a3a' : '2px solid rgba(45,42,36,0.25)' }}
                    />
                    <span>
                      <span className="block text-[13px] font-medium text-[#2d2a24]">{o.t}</span>
                      <span className="text-[11.5px] text-[#7a766d]">{o.d}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Link
              href={`/${locale}/dashboard`}
              className="px-[18px] py-3.5 rounded-xl bg-[#4f6b40] text-[#f4f0e6] text-center text-[14.5px] font-medium shadow-[0_8px_22px_rgba(79,107,64,0.30)] hover:brightness-105 transition inline-flex items-center justify-center gap-1.5"
            >
              {fr ? 'créer l’atelier' : 'create the workshop'} <ChevronRight className="w-4 h-4" />
            </Link>
            <div className="text-[11px] text-[#9a948a] text-center">
              {fr ? 'l’IA extraira ensuite les briques · tu pourras tout ajuster' : 'the AI then extracts the bricks · you can adjust everything'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
