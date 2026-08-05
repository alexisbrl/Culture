import * as React from "react"

import { cn } from "@/lib/utils"

type BadgeTone =
  | "neutral"
  | "premium"
  | "success"
  | "green"
  | "tan"
  | "alert"
  | "warn"
  | "ink"
  | "version"

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--cream-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  premium: "bg-[var(--gold-100)] text-[var(--gold-600)] border-[var(--gold-300)]",
  success: "bg-[var(--success-100)] text-[var(--success-600)] border-transparent",
  green: "bg-[var(--green-100)] text-[var(--green-800)] border-[var(--green-300)]",
  tan: "bg-[var(--tan-100)] text-[var(--tan-700)] border-[var(--tan-300)]",
  alert: "bg-[var(--alert-100)] text-[var(--alert-600)] border-transparent",
  warn: "bg-[var(--warn-100)] text-[var(--warn-500)] border-transparent",
  ink: "bg-[var(--ink-900)] text-[var(--text-on-dark)] border-transparent",
  // Pastille "V2"/"V3" : plus petite, coins moins arrondis.
  version:
    "bg-[var(--cream-sunken)] text-[var(--text-faint)] border-[var(--border)] rounded-[var(--radius-xs)] px-[6px] py-[3px] text-[10px] font-bold tracking-[0.06em]",
}

type BadgeProps = React.ComponentProps<"span"> & {
  tone?: BadgeTone
  /** Alias historique — la vitrine (hors périmètre) passe encore ce nom. */
  variant?: "outline"
}

/** Badge — étiquette de statut compacte (Culture Design System, `_ds_bundle.js`). */
function Badge({ tone = "neutral", variant, className, ...props }: BadgeProps) {
  const resolvedTone = variant === "outline" ? "neutral" : tone
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-[9px] py-1 font-sans text-[11.5px] leading-none font-semibold whitespace-nowrap",
        TONE_CLASSES[resolvedTone],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
