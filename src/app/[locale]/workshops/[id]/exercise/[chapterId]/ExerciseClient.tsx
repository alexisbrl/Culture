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

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Check, Loader2, RotateCw, X } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
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

    let border: string = ink(0.14);
    let background: string = palette.paper;
    if (result) {
      if (correct) { border = palette.green; background = withAlpha(palette.green, 0.10); }
      else if (picked) { border = palette.danger; background = withAlpha(palette.danger, 0.10); }
    } else if (picked) {
      border = palette.green;
      background = withAlpha(palette.green, 0.08);
    }

    return {
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left' as const,
      padding: '12px 14px', borderRadius: 11, border: `1.5px solid ${border}`, background,
      color: palette.ink, fontSize: 14, fontFamily: 'inherit', cursor: result ? 'default' : 'pointer',
      marginBottom: 8,
    };
  }

  const verdictTone =
    result?.correct === true ? palette.green : result?.correct === false ? palette.danger : palette.inkMuted;

  return (
    <div style={{ minHeight: 'calc(100vh - 65px)', background: palette.cream, padding: '26px 22px 60px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link
          href={`/${locale}/workshops/${workshopId}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 12.5, color: palette.inkMuted, marginBottom: 16 }}
        >
          <ArrowLeft size={14} /> {t('back', { workshop: workshopName })}
        </Link>

        <div style={{ fontSize: 11.5, color: palette.inkFaint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {t('chapterLabel')}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: palette.ink, margin: '2px 0 18px' }}>{chapterName}</h1>

        {error && <div style={{ fontSize: 12.5, color: palette.danger, marginBottom: 12 }}>{error}</div>}

        <div style={{ background: withAlpha(palette.paper, 0.9), borderRadius: 16, border: `1px solid ${ink(0.07)}`, padding: '22px 24px' }}>
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
                <div style={{ fontSize: 12, color: palette.inkFaint, marginBottom: 6 }}>{prompt.title}</div>
              )}
              <div style={{ fontSize: 16.5, color: palette.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 18 }}>
                {prompt.content.trim() || tExam('noStatement')}
              </div>

              {isChoice && prompt.choices.map((choice) => (
                <button key={choice.index} onClick={() => toggleChoice(choice.index)} style={choiceStyle(choice.index)} disabled={!!result}>
                  <span style={{ flex: 1 }}>{choice.text}</span>
                  {result?.correctChoices.includes(choice.index) && <Check size={15} color={palette.green} />}
                  {result && selected.includes(choice.index) && !result.correctChoices.includes(choice.index) && <X size={15} color={palette.danger} />}
                </button>
              ))}

              {isFreeText && (
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  readOnly={!!result}
                  rows={prompt.textLines}
                  placeholder={t('answerPlaceholder')}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 11, border: `1px solid ${ink(0.14)}`, background: palette.paper, color: palette.ink, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
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
                  <button
                    onClick={handleValidate}
                    disabled={!canValidate}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, background: canValidate ? palette.green : ink(0.12), border: 'none', color: canValidate ? palette.parchment : palette.inkFaint, fontSize: 13.5, cursor: canValidate ? 'pointer' : 'default', fontFamily: 'inherit' }}
                  >
                    {checking && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    {prompt.responseType === 'sans_reponse' ? t('revealAnswer') : t('validate')}
                  </button>
                ) : (
                  <button
                    onClick={() => draw(prompt.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, background: palette.green, border: 'none', color: palette.parchment, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <RotateCw size={14} /> {t('next')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
