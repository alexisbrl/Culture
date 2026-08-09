import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, rows = 3, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        "min-h-[84px] w-full min-w-0 resize-y rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-input)] px-[13px] py-[11px] text-[14.5px] leading-[1.5] text-[var(--text-strong)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-soft)] placeholder:text-[var(--text-faint)] hover:border-[var(--tan-300)] focus:border-[var(--green-500)] focus:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--alert-500)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
