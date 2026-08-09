import * as React from "react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type TabItem = { value: string; label: React.ReactNode; badge?: React.ReactNode } | string

type TabsProps = {
  tabs: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Tabs — navigation soulignée (Culture Design System). Onglet actif : filet vert. */
function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const items = tabs.map((t) => (typeof t === "string" ? { value: t, label: t } : t))
  return (
    <div role="tablist" className={cn("flex gap-6 border-b border-[var(--border)] font-sans", className)}>
      {items.map((t) => {
        const active = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative inline-flex items-center gap-[7px] pb-3 text-sm leading-none font-medium text-[var(--text-muted)] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)] hover:text-[var(--text-strong)] focus-visible:rounded-[var(--radius-xs)] focus-visible:shadow-[var(--shadow-focus)]",
              active &&
                "font-semibold text-[var(--text-strong)] after:absolute after:right-0 after:-bottom-px after:left-0 after:h-0.5 after:rounded-full after:bg-[var(--green-700)]"
            )}
          >
            {t.label}
            {t.badge && <Badge tone="version">{t.badge}</Badge>}
          </button>
        )
      })}
    </div>
  )
}

export { Tabs }
