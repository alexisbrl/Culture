import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "w-full min-w-0 appearance-none rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-input)] py-[11px] pr-9 pl-[13px] text-[14.5px] leading-[1.3] text-[var(--text-strong)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-soft)] hover:border-[var(--tan-300)] focus:border-[var(--green-500)] focus:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--alert-500)]",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)]"
      />
    </div>
  )
}

export { Select }
