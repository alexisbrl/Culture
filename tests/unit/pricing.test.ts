// Le coût d'un appel — ce qu'on facture à un compte, et ce qui dit si une
// génération vaut ce qu'elle coûte. Deux pièges y vivent : les deux
// fournisseurs ne comptent pas l'entrée de la même façon, et DeepSeek double
// ses prix aux heures pleines.

import { describe, expect, it } from 'vitest';

import { lostCallUsage, type CallProgress } from '@/lib/ingest/callProgress';
import { callCostUsd, estimateOutputTokens, isDeepSeekPeak } from '@/lib/ingest/pricing';

const usage = (inputTokens: number, outputTokens: number, cachedTokens = 0, cacheCreationTokens = 0) => ({
  inputTokens,
  outputTokens,
  cachedTokens,
  cacheCreationTokens,
});

// Mercredi 07/10/2026, 17h47 UTC : heures creuses chez DeepSeek.
const OFF_PEAK = new Date('2026-10-07T17:47:00Z');
// Mercredi 07/10/2026, 08h00 UTC : heures pleines.
const PEAK = new Date('2026-10-07T08:00:00Z');

describe('callCostUsd', () => {
  it('chiffre un appel Sonnet 5 au tarif public', () => {
    // L'étape chapitres du 07/10/2026 : 274 199 lus, 1 115 écrits.
    expect(callCostUsd('claude', 'claude-sonnet-5', usage(274_199, 1_115), OFF_PEAK)).toBeCloseTo(0.559548, 6);
  });

  it('chez Anthropic, le cache s’ajoute à l’entrée ; chez DeepSeek, il en fait partie', () => {
    // Anthropic : 1 000 lus hors cache + 1 000 lus en cache.
    expect(callCostUsd('claude', 'claude-sonnet-5', usage(1_000_000, 0, 1_000_000), OFF_PEAK)).toBeCloseTo(2 + 0.2, 6);
    // DeepSeek : 1 000 000 lus DONT 400 000 en cache.
    expect(callCostUsd('deepseek', 'deepseek-flash', usage(1_000_000, 0, 400_000), OFF_PEAK)).toBeCloseTo(0.6 * 0.15 + 0.4 * 0.003, 6);
  });

  it('double DeepSeek aux heures pleines', () => {
    const offPeak = callCostUsd('deepseek', 'deepseek-flash', usage(100_000, 100_000), OFF_PEAK)!;
    expect(callCostUsd('deepseek', 'deepseek-flash', usage(100_000, 100_000), PEAK)).toBeCloseTo(offPeak * 2, 6);
  });

  it('reconnaît l’ancien nom du modèle DeepSeek et les identifiants datés', () => {
    expect(callCostUsd('deepseek', 'deepseek-v4-flash', usage(1_000_000, 0), OFF_PEAK)).toBeCloseTo(0.15, 6);
    expect(callCostUsd('claude', 'claude-haiku-4-5-20251001', usage(1_000_000, 0), OFF_PEAK)).toBeCloseTo(1, 6);
  });

  it('chiffre Jev à l’entrée seule, même sous un autre nom de décideur', () => {
    expect(callCostUsd('jev', 'jev-1.13.0', usage(1_000_000, 1_000_000), OFF_PEAK)).toBeCloseTo(0.042, 6);
  });

  it('ne confond pas Opus 5.5 avec Opus 5', () => {
    expect(callCostUsd('claude', 'claude-opus-5-5', usage(1_000_000, 0), OFF_PEAK)).toBeCloseTo(4, 6);
    expect(callCostUsd('claude', 'claude-opus-5', usage(1_000_000, 0), OFF_PEAK)).toBeCloseTo(5, 6);
  });

  it('rend null — jamais 0 — pour un modèle qu’il ne connaît pas', () => {
    expect(callCostUsd('claude', 'claude-inconnu', usage(1_000, 1_000), OFF_PEAK)).toBeNull();
    expect(callCostUsd('claude', undefined, usage(1_000, 1_000), OFF_PEAK)).toBeNull();
  });
});

describe('isDeepSeekPeak', () => {
  it('suit les plages pleines, en semaine seulement', () => {
    expect(isDeepSeekPeak(new Date('2026-10-07T01:00:00Z'))).toBe(true);
    expect(isDeepSeekPeak(new Date('2026-10-07T04:00:00Z'))).toBe(false);
    expect(isDeepSeekPeak(new Date('2026-10-07T09:59:00Z'))).toBe(true);
    expect(isDeepSeekPeak(new Date('2026-10-07T10:00:00Z'))).toBe(false);
    // Samedi 10/10/2026 : tout en creuses.
    expect(isDeepSeekPeak(new Date('2026-10-10T08:00:00Z'))).toBe(false);
  });
});

describe('l’appel perdu', () => {
  it('estime la sortie au débit, sur le temps qu’il a vécu', () => {
    expect(estimateOutputTokens(300_000, 118)).toBe(35_400);
    expect(estimateOutputTokens(0, 118)).toBe(0);
  });

  it('garde l’entrée exacte quand le fournisseur l’a annoncée', () => {
    const progress: CallProgress = {
      importId: 'i',
      workshopId: 'w',
      step: 'notions',
      provider: 'claude',
      model: 'claude-sonnet-5',
      startedAt: '2026-10-07T17:47:45Z',
      lastAliveAt: '2026-10-07T17:52:45Z',
      inputTokens: 50_000,
    };
    const { usage: lost, livedMs } = lostCallUsage(progress, 118);
    expect(livedMs).toBe(300_000);
    expect(lost.inputTokens).toBe(50_000);
    expect(lost.outputTokens).toBe(35_400);
  });

  it('à défaut, estime l’entrée à la taille de la demande', () => {
    const progress: CallProgress = {
      importId: 'i',
      workshopId: 'w',
      step: 'questions',
      provider: 'deepseek',
      startedAt: '2026-10-07T17:47:45Z',
      lastAliveAt: '2026-10-07T17:47:45Z',
      inputChars: 30_000,
    };
    expect(lostCallUsage(progress, 250).usage.inputTokens).toBe(10_000);
  });
});
