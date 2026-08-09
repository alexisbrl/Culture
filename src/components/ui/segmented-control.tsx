import * as React from "react"

import { cn } from "@/lib/utils"

type SegmentedOption = { value: string; label: React.ReactNode } | string

type SegmentedControlProps = {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/** SegmentedControl — bascule pilule pour 2-4 options courtes (Culture Design System). */
function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-0.5 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--cream-sunken)] p-[3px] font-sans",
        className
      )}
    >
      {items.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[var(--radius-pill)] px-3.5 py-1.5 text-[13px] leading-none font-semibold whitespace-nowrap text-[var(--text-muted)] outline-none transition-all duration-[var(--dur-fast)] ease-[var(--ease-soft)] hover:text-[var(--text-strong)] focus-visible:shadow-[var(--shadow-focus)]",
              active && "bg-[var(--surface-card)] text-[var(--text-strong)] shadow-[var(--shadow-xs)]"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
