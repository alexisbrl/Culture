import * as React from "react"

import { cn } from "@/lib/utils"

const SIZE_CLASSES = { sm: "h-1.5", md: "h-[9px]", lg: "h-[13px]" } as const

const TONES = {
  green: "var(--green-600)",
  sage: "var(--green-500)",
  light: "var(--green-400)",
  tan: "var(--tan-500)",
} as const

type ProgressBarProps = {
  value?: number
  max?: number
  label?: React.ReactNode
  showValue?: boolean
  valueText?: string
  tone?: keyof typeof TONES
  size?: keyof typeof SIZE_CLASSES
  /** Pour une tâche longue dont l'avancement arrive par à-coups (une ingestion
   *  IA avance d'un cran toutes les dizaines de secondes). Deux effets, qui vont
   *  ensemble : la largeur se déplace **lentement** vers sa nouvelle valeur au
   *  lieu de sauter, et une vague traverse le remplissage en continu. La vague
   *  ne représente rien — elle dit que le travail est en cours, ce que la barre
   *  immobile ne disait pas. */
  animated?: boolean
  className?: string
}

/** ProgressBar — indicateur de progression, remplissage sauge sur piste creuse. */
function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = false,
  valueText,
  tone = "green",
  size = "md",
  animated = false,
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cn("w-full font-sans", className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
          {label && <span className="text-[13px] text-[var(--text-body)]">{label}</span>}
          {showValue && (
            <span className="text-[12.5px] font-semibold text-[var(--text-muted)] tabular-nums">
              {valueText || `${Math.round(pct)} %`}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
        className={cn(
          "overflow-hidden rounded-[var(--radius-pill)] bg-[var(--cream-sunken)] shadow-[var(--shadow-inset)]",
          SIZE_CLASSES[size]
        )}
      >
        <div
          className={cn(
            "relative h-full overflow-hidden rounded-[var(--radius-pill)] transition-[width] ease-[var(--ease-out)]",
            // 1,6 s contre ~0,3 s : un pas de 10 % se lit comme un mouvement,
            // pas comme un saut. C'est long pour une barre ordinaire, et c'est
            // le but ici — il n'y a pas de pas suivant avant longtemps.
            animated ? "duration-[1600ms]" : "duration-[var(--dur-slow)]"
          )}
          style={{ width: `${pct}%`, background: TONES[tone] ?? TONES.green }}
        >
          {animated && (
            // Large et floue, elle balaie le remplissage de gauche à droite.
            // `aria-hidden` : c'est un signe de vie, pas une information — le
            // `role="progressbar"` du parent porte déjà la valeur réelle.
            <span
              aria-hidden
              className="progress-wave absolute inset-y-0 left-0 w-2/5"
              style={{
                background: `linear-gradient(90deg, transparent, ${TONES.light}, transparent)`,
                opacity: 0.55,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export { ProgressBar }
