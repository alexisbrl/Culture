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
          className="h-full rounded-[var(--radius-pill)] transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]"
          style={{ width: `${pct}%`, background: TONES[tone] ?? TONES.green }}
        />
      </div>
    </div>
  )
}

export { ProgressBar }
