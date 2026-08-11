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
import { ArrowRight, Check, Leaf, Loader2, RotateCw, Sprout, X } from 'lucide-react';
import { palette, radius, withAlpha, shadow } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import LinkButton from '@/components/LinkButton';
import { drawExercise, gradeExercise } from '@/app/actions/parcoursExercise';
import type { ExercisePart, ExercisePrompt, ExerciseResult } from '@/lib/workshops/examTypes';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  chapterId: string;
  chapterName: string;
};

// Longueur de session choisie côté client : le tirage serveur pioche
// indéfiniment sans notion de fin de chapitre (voir plus haut) — ce nombre est
// une règle produit provisoire, à revoir avec la vraie mécanique de
// progression (docs/backlog.md). Voir docs/chantiers/2026-08-05-refonte-ui-design-system.md, T23.
const EXERCISE_SESSION_LENGTH = 10;

export default function ExerciseClient({ locale, workshopId, workshopName, chapterId, chapterName }: Props) {
  const t = useTranslations('exercise');
  const tExam = useTranslations('examen');

  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState<ExercisePrompt | null>(null);
  // Un tableau par énoncé de la grappe : l'indice 0 est la question principale,
  // les suivants ses questions liées, dans l'ordre de `prompt.parts`.
  const [selected, setSelected] = useState<number[][]>([[]]);
  const [freeText, setFreeText] = useState<string[]>(['']);
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  const draw = useCallback(
    async (excludeId?: string) => {
      setLoading(true);
      setError('');
      setResult(null);
      setSelected([[]]);
      setFreeText(['']);
      const res = await drawExercise(workshopId, chapterId, excludeId);
      if (res.error) setError(res.error);
      setPrompt(res.prompt);
      // Une case de réponse par énoncé : la question principale et chacune de
      // ses questions liées.
      const slots = 1 + (res.prompt?.parts.length ?? 0);
      setSelected(Array.from({ length: slots }, () => []));
      setFreeText(Array.from({ length: slots }, () => ''));
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
    const answeredSoFar = answeredCount + 1;
    setAnsweredCount(answeredSoFar);
    // Une grappe compte pour une : elle est réussie si aucun de ses énoncés
    // n'est faux et qu'au moins un a pu être corrigé automatiquement (une
    // question entièrement libre ne prouve rien, voir `ExerciseResult`).
    const outcomes = [res.result, ...(res.result.parts ?? [])];
    if (outcomes.some((o) => o.correct !== null) && outcomes.every((o) => o.correct !== false)) {
      setCorrectCount((c) => c + 1);
    }
    if (answeredSoFar >= EXERCISE_SESSION_LENGTH) setDone(true);
  }

  /** Énoncés de la grappe, dans l'ordre d'affichage et de correction : la
   *  question principale puis ses questions liées. */
  const statements = prompt
    ? [
        { content: prompt.content, responseType: prompt.responseType, choices: prompt.choices, textLines: prompt.textLines },
        ...prompt.parts,
      ]
    : [];

  function setChoicesAt(idx: number, next: number[]) {
    setSelected((prev) => prev.map((v, i) => (i === idx ? next : v)));
  }
  function setTextAt(idx: number, next: string) {
    setFreeText((prev) => prev.map((v, i) => (i === idx ? next : v)));
  }

  // Une réponse est requise sur CHAQUE énoncé qui en attend une, sauf ceux sans
  // réponse attendue (où le bouton sert juste à afficher la correction).
  const canValidate =
    !!prompt && !result && !checking &&
    statements.every((s, i) => {
      if (s.responseType === 'qcs' || s.responseType === 'qcm') return (selected[i] ?? []).length > 0;
      if (s.responseType === 'sans_reponse') return true;
      return (freeText[i] ?? '').trim().length > 0;
    });

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

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 40px', display: 'flex' }}>
        {done ? (
          <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 420, padding: '24px 0' }}>
            <div style={{ width: 120, height: 120, borderRadius: radius.pill, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Leaf size={48} strokeWidth={1.5} color={palette.green} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 30, color: palette.greenBrand }}>{t('doneTitle')}</div>
            <div style={{ fontSize: 14.5, color: palette.inkSoft, marginTop: 10 }}>{t('doneScore', { count: correctCount })}</div>
            <div style={{ marginTop: 28 }}>
              <LinkButton href={`/${locale}/workshops/${workshopId}`} variant="primary" size="lg">
                {t('backToParcours')} <ArrowRight size={16} strokeWidth={1.75} />
              </LinkButton>
            </div>
          </div>
        ) : (
        <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
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

                {prompt.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier privé (URL signée éphémère), pas un asset next/image
                  <img src={prompt.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12, border: `1px solid ${palette.line}`, marginBottom: 18 }} />
                )}
                {prompt.audioUrl && (
                  <audio controls src={prompt.audioUrl} style={{ width: '100%', marginBottom: 18 }} />
                )}

                {/* Zone de réponse de la question principale, puis chaque
                    question liée avec son propre énoncé et sa correction.
                    L'image et l'audio ne sont pas répétés : ce sont les
                    éléments communs de la grappe. */}
                <AnswerZone
                  statement={statements[0]}
                  selected={selected[0] ?? []}
                  freeText={freeText[0] ?? ''}
                  result={result}
                  onChoices={(next) => setChoicesAt(0, next)}
                  onText={(next) => setTextAt(0, next)}
                />

                {prompt.parts.map((part, i) => (
                  <div key={i} style={{ marginTop: 26, paddingTop: 22, borderTop: `1px solid ${palette.line}` }}>
                    <div style={{ fontSize: 16.5, fontWeight: 700, color: palette.ink, lineHeight: 1.4, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
                      {part.content.trim() || tExam('noStatement')}
                    </div>
                    <AnswerZone
                      statement={part}
                      selected={selected[i + 1] ?? []}
                      freeText={freeText[i + 1] ?? ''}
                      result={result?.parts?.[i] ?? null}
                      onChoices={(next) => setChoicesAt(i + 1, next)}
                      onText={(next) => setTextAt(i + 1, next)}
                    />
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  {!result ? (
                    <Button variant="primary" onClick={handleValidate} disabled={!canValidate}>
                      {checking && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                      {/* « Voir la réponse » seulement si AUCUN énoncé de la
                          grappe n'attend de réponse : dès qu'il y en a un, le
                          bouton valide bien quelque chose. */}
                      {statements.every((s) => s.responseType === 'sans_reponse') ? t('revealAnswer') : t('validate')}
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
        )}
      </div>
    </div>
  );
}

/** Zone de réponse d'UN énoncé : les choix à cocher ou le champ libre, puis sa
 *  correction une fois validé. Le même bloc sert la question principale et
 *  chaque question liée — elles se répondent et se corrigent à l'identique,
 *  seuls les éléments communs (énoncé illustré, audio) ne sont pas répétés.
 *  Définie au niveau module : une fonction composant recréée à chaque rendu
 *  remonterait tout son sous-arbre (et ferait perdre le focus à la saisie). */
function AnswerZone({ statement, selected, freeText, result, onChoices, onText }: {
  statement: ExercisePart;
  selected: number[];
  freeText: string;
  result: ExerciseResult | null;
  onChoices: (next: number[]) => void;
  onText: (next: string) => void;
}) {
  const t = useTranslations('exercise');

  const isChoice = statement.responseType === 'qcs' || statement.responseType === 'qcm';
  const isFreeText = !isChoice && statement.responseType !== 'sans_reponse';

  function toggleChoice(index: number) {
    if (result) return;
    // QCS : un seul choix — sélectionner remplace. QCM : bascule.
    if (statement.responseType === 'qcs') onChoices([index]);
    else onChoices(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]);
  }

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
    <>
      {isChoice && statement.choices.map((choice) => (
        <button key={choice.index} onClick={() => toggleChoice(choice.index)} style={choiceStyle(choice.index)} disabled={!!result}>
          <span style={{ flex: 1 }}>{choice.text}</span>
          {result?.correctChoices.includes(choice.index) && <Check size={18} color={palette.green} />}
          {result && selected.includes(choice.index) && !result.correctChoices.includes(choice.index) && <X size={18} color={palette.danger} />}
        </button>
      ))}

      {isFreeText && (
        <textarea
          value={freeText}
          onChange={(e) => onText(e.target.value)}
          readOnly={!!result}
          rows={statement.textLines}
          placeholder={t('answerPlaceholder')}
          style={{ width: '100%', padding: '13px 15px', borderRadius: 12, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceInput, color: palette.ink, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
      )}

      {result && (
        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, border: `1px solid ${withAlpha(verdictTone, 0.35)}`, background: withAlpha(verdictTone, 0.08) }}>
          {/* Verdict masqué quand il n'y a pas de correction automatique ET
              qu'une réponse attendue est affichée : les deux lignes diraient la
              même chose. */}
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
    </>
  );
}
