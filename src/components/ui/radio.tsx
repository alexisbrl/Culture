import * as React from "react"

import { cn } from "@/lib/utils"

type RadioProps = Omit<React.ComponentProps<"input">, "type"> & {
  label?: React.ReactNode
  description?: React.ReactNode
  /** Variante carte : filet, fond levé, surbrillance tan quand sélectionné. */
  card?: boolean
}

function Radio({ label, description, card = false, checked, className, ...props }: RadioProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5",
        card &&
          "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-card)] px-[14px] py-[13px] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)] hover:border-[var(--tan-300)]",
        card && checked && "border-[var(--tan-400)] bg-[var(--tan-100)]",
        className
      )}
    >
      <input type="radio" data-slot="radio" checked={checked} className="peer absolute h-0 w-0 opacity-0" {...props} />
      <span className="relative mt-px flex size-[18px] flex-none items-center justify-center rounded-full border-[1.5px] border-[var(--border-strong)] bg-[var(--surface-input)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)] after:size-2 after:scale-0 after:rounded-full after:bg-[var(--green-700)] after:transition-transform after:duration-[var(--dur-fast)] after:ease-[var(--ease-out)] peer-checked:border-[var(--green-600)] peer-checked:after:scale-100 peer-focus-visible:shadow-[var(--shadow-focus)] peer-disabled:opacity-50" />
      {(label || description) && (
        <span className="peer-disabled:opacity-50">
          {label && <span className="block text-sm font-semibold text-[var(--text-strong)]">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-[12.5px] text-[var(--text-muted)]">{description}</span>
          )}
        </span>
      )}
    </label>
  )
}

export { Radio }
