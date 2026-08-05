'use client';

// Écran d'exercice : une question tirée au hasard parmi celles du chapitre, une
// zone de réponse, puis la correction après validation.
//
// ⚠️ Le client ne reçoit jamais la réponse tant qu'il n'a pas validé : le
// tirage renvoie un `ExercisePrompt` (sans `answer` ni `correctChoices`) et la
// correction est calculée par le serveur. Voir app/actions/parcoursExercise.ts.
//
// Les choix portent leur index d'origine (`choice.index`) : c'est lui qu'on
// renvoie à la validation, ce qui permet au serveur de mélanger l'ordre
// d'affichage sans mémoriser de permutation.
//
// Coquille plein écran (position fixed, au-dessus de la barre du haut/du bas —
// masquées par ailleurs sur /exercise/ dans DashboardHeader.tsx) : aucune
// notion de « session » ou de progression n'existe côté serveur (le tirage
// pioche indéfiniment, sans fin de chapitre), donc pas de barre de progression
// ici — voir docs/chantiers/2026-08-05-refonte-ui-design-system.md, T21.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Loader2, RotateCw, Sprout, X } from 'lucide-react';
import { palette, withAlpha, shadow } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { drawExercise, gradeExercise } from '@/app/actions/parcoursExercise';
import type { ExercisePrompt, ExerciseResult } from '@/lib/workshops/examTypes';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  chapterId: string;
  chapterName: string;
};

export default function ExerciseClient({ locale, workshopId, workshopName, chapterId, chapterName }: Props) {
  const t = useTranslations('exercise');
  const tExam = useTranslations('examen');

  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState<ExercisePrompt | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const draw = useCallback(
    async (excludeId?: string) => {
      setLoading(true);
      setError('');
      setResult(null);
      setSelected([]);
      setFreeText('');
      const res = await drawExercise(workshopId, chapterId, excludeId);
      if (res.error) setError(res.error);
      setPrompt(res.prompt);
      setLoading(false);
    },
    [workshopId, chapterId]
  );

  useEffect(() => {
    draw();
  }, [draw]);

  async function handleValidate() {
    if (!prompt) return;
    setChecking(true);
    setError('');
    const res = await gradeExercise(workshopId, prompt.id, selected);
    setChecking(false);
    if (res.error || !res.result) {
      setError(res.error ?? t('gradeError'));
      return;
    }
    setResult(res.result);
  }

  const isChoice = prompt?.responseType === 'qcs' || prompt?.responseType === 'qcm';
  const isFreeText = !!prompt && !isChoice && prompt.responseType !== 'sans_reponse';

  function toggleChoice(index: number) {
    if (result) return;
    // QCS : un seul choix — sélectionner remplace. QCM : bascule.
    if (prompt?.responseType === 'qcs') setSelected([index]);
    else setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  }

  // Une réponse est requise pour valider, sauf pour les questions sans réponse
  // attendue (où le bouton sert juste à afficher la correction).
  const canValidate =
    !!prompt && !result && !checking && (isChoice ? selected.length > 0 : isFreeText ? freeText.trim().length > 0 : true);

  function choiceStyle(index: number): React.CSSProperties {
    const picked = selected.includes(index);
    const correct = result?.correctChoices.includes(index) ?? false;

    let border: string = palette.lineStrong;
    let background: string = palette.surfaceInput;
    if (result) {
      if (correct) { border = palette.green; background = withAlpha(palette.green, 0.1); }
      else if (picked) { border = palette.danger; background = withAlpha(palette.danger, 0.1); }
    } else if (picked) {
      border = palette.green;
      background = withAlpha(palette.green, 0.08);
    }

    return {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
      textAlign: 'left' as const, padding: '15px 17px', borderRadius: 12, border: `1.5px solid ${border}`,
      background, color: palette.ink, fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
      cursor: result ? 'default' : 'pointer', marginBottom: 9, boxShadow: shadow.sm,
      transition: 'border-color 120ms ease, background 120ms ease',
    };
  }

  const verdictTone =
    result?.correct === true ? palette.green : result?.correct === false ? palette.danger : palette.inkMuted;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', background: palette.cream }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px' }}>
        <Link
          href={`/${locale}/workshops/${workshopId}`}
          title={t('back', { workshop: workshopName })}
          style={{ width: 36, height: 36, borderRadius: 12, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, flexShrink: 0 }}
        >
          <X size={16} strokeWidth={1.75} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: palette.inkFaint, textTransform: 'uppercase' }}>
            {t('chapterLabel')}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chapterName}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 40px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {error && <div style={{ fontSize: 12.5, color: palette.danger, marginBottom: 12 }}>{error}</div>}

          <div style={{ background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 16, padding: '22px 24px', boxShadow: shadow.sm }}>
            {loading ? (
              <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 13, color: palette.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> {t('drawing')}
              </div>
            ) : !prompt ? (
              <div style={{ padding: '30px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: palette.ink }}>{t('emptyTitle')}</div>
                <div style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 6 }}>{t('emptyDesc')}</div>
              </div>
            ) : (
              <>
                {prompt.title.trim() && (
                  <div style={{ fontSize: 12, color: palette.inkFaint, marginBottom: 8 }}>{prompt.title}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.green, flexShrink: 0 }}>
                    <Sprout size={20} strokeWidth={1.75} />
                  </span>
                  <span style={{ fontSize: 21, fontWeight: 700, color: palette.ink, lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>
                    {prompt.content.trim() || tExam('noStatement')}
                  </span>
                </div>

                {isChoice && prompt.choices.map((choice) => (
                  <button key={choice.index} onClick={() => toggleChoice(choice.index)} style={choiceStyle(choice.index)} disabled={!!result}>
                    <span style={{ flex: 1 }}>{choice.text}</span>
                    {result?.correctChoices.includes(choice.index) && <Check size={18} color={palette.green} />}
                    {result && selected.includes(choice.index) && !result.correctChoices.includes(choice.index) && <X size={18} color={palette.danger} />}
                  </button>
                ))}

                {isFreeText && (
                  <textarea
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    readOnly={!!result}
                    rows={prompt.textLines}
                    placeholder={t('answerPlaceholder')}
                    style={{ width: '100%', padding: '13px 15px', borderRadius: 12, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceInput, color: palette.ink, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                )}

                {result && (
                  <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, border: `1px solid ${withAlpha(verdictTone, 0.35)}`, background: withAlpha(verdictTone, 0.08) }}>
                    {/* Verdict masqué quand il n'y a pas de correction
                        automatique ET qu'une réponse attendue est affichée : les
                        deux lignes diraient la même chose. */}
                    {(result.correct !== null || !result.answer.trim()) && (
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: verdictTone }}>
                        {result.correct === true ? t('verdictCorrect') : result.correct === false ? t('verdictWrong') : t('verdictNeutral')}
                      </div>
                    )}
                    {result.answer.trim() && (
                      <div style={{ fontSize: 13.5, color: palette.ink, whiteSpace: 'pre-wrap', marginTop: result.correct !== null ? 8 : 0 }}>
                        <span style={{ color: palette.inkFaint }}>{t('expectedAnswer')} </span>
                        {result.answer}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  {!result ? (
                    <Button variant="primary" onClick={handleValidate} disabled={!canValidate}>
                      {checking && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                      {prompt.responseType === 'sans_reponse' ? t('revealAnswer') : t('validate')}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => draw(prompt.id)}>
                      <RotateCw size={14} strokeWidth={1.75} /> {t('next')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
