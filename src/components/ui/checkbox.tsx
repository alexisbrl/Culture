import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxProps = Omit<React.ComponentProps<"input">, "type"> & {
  label?: React.ReactNode
}

function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-start gap-[9px]", className)}>
      <input type="checkbox" data-slot="checkbox" className="peer absolute h-0 w-0 opacity-0" {...props} />
      <span className="mt-px flex size-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] border-[var(--border-strong)] bg-[var(--surface-input)] text-transparent transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)] peer-checked:border-[var(--green-700)] peer-checked:bg-[var(--green-700)] peer-checked:text-white peer-focus-visible:shadow-[var(--shadow-focus)] peer-disabled:opacity-50">
        <Check size={13} strokeWidth={2.6} />
      </span>
      {label && <span className="text-sm text-[var(--text-body)] peer-disabled:opacity-50">{label}</span>}
    </label>
  )
}

export { Checkbox }
