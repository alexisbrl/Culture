import * as React from "react"

import { cn } from "@/lib/utils"

type CardTone = "default" | "sunken" | "tan" | "dark" | "dashed"

const PADS = { sm: 14, md: 20, lg: 28 } as const

const TONE_CLASSES: Record<CardTone, string> = {
  default: "bg-[var(--surface-card)] border-[var(--border)] text-[var(--text-body)] shadow-[var(--shadow-sm)]",
  sunken: "bg-[var(--surface-sunken)] border-[var(--border)] text-[var(--text-body)]",
  tan: "bg-[var(--tan-100)] border-[var(--tan-300)] text-[var(--text-body)]",
  dark: "bg-[var(--surface-dark)] border-transparent text-[var(--text-on-dark)] shadow-[var(--shadow-md)]",
  dashed: "border-[1.5px] border-dashed border-[var(--line-strong)] bg-transparent text-[var(--text-body)]",
}

type CardProps = React.ComponentProps<"div"> & {
  tone?: CardTone
  pad?: "sm" | "md" | "lg" | number
  hover?: boolean
  flat?: boolean
  eyebrow?: React.ReactNode
}

/**
 * Card — le conteneur crème levé sur lequel tout repose (Culture Design
 * System, `_ds_bundle.js`). `tone`: default(levé) · sunken · dark(feature) ·
 * dashed("à venir"). `eyebrow` rend le libellé UPPERCASE.
 */
function Card({
  tone = "default",
  pad = "md",
  hover = false,
  flat = false,
  eyebrow,
  className,
  style,
  children,
  ...props
}: CardProps) {
  const padding = typeof pad === "number" ? pad : PADS[pad]
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-[var(--radius-lg)] border",
        TONE_CLASSES[tone],
        flat && "shadow-none",
        hover &&
          "cursor-pointer transition-[transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
        className
      )}
      style={{ padding, ...style }}
      {...props}
    >
      {eyebrow && (
        <div
          className={cn(
            "mb-3 text-[11.5px] font-bold tracking-[0.14em] text-[var(--text-muted)] uppercase",
            tone === "dark" && "text-[var(--gold-300)]"
          )}
        >
          {eyebrow}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Alias historique — la vitrine (hors périmètre du chantier) compose encore
 * `<Card><CardContent className="p-6">…` ; ce n'est plus qu'un passe-plat.
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />
}

export { Card, CardContent }
