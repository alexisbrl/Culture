import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type PillProps = React.HTMLAttributes<HTMLElement> & {
  /** `button` pour une pilule de filtre cliquable, `div` (défaut) pour un statut. */
  as?: "div" | "button"
  icon?: LucideIcon
  active?: boolean
}

/** Pill — chip arrondi de statut/filtre (Culture Design System, `_ds_bundle.js`). */
function Pill({ as = "div", icon: Icon, active = false, className, children, ...props }: PillProps) {
  const Tag = as
  return (
    <Tag
      data-slot="pill"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-card)] px-3 py-[5px] font-sans text-[12.5px] leading-none font-medium text-[var(--text-body)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)]",
        as === "button" && "cursor-pointer hover:border-[var(--tan-300)] hover:bg-[var(--surface-sunken)]",
        active && "border-[var(--green-300)] bg-[var(--green-100)] text-[var(--green-800)]",
        className
      )}
      {...props}
    >
      {Icon && <Icon size={14} strokeWidth={1.75} className={active ? "text-[var(--green-700)]" : "text-[var(--tan-500)]"} />}
      {children}
    </Tag>
  )
}

export { Pill }
