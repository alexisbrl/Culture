import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ComponentProps<"input">, "type">

function Switch({ className, ...props }: SwitchProps) {
  return (
    <label className={cn("relative inline-flex h-5 w-9 flex-none cursor-pointer items-center", className)}>
      <input type="checkbox" role="switch" data-slot="switch" className="peer absolute h-0 w-0 opacity-0" {...props} />
      <span className="absolute inset-0 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--border-strong)] bg-[var(--surface-sunken)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)] peer-checked:border-[var(--green-700)] peer-checked:bg-[var(--green-700)] peer-focus-visible:shadow-[var(--shadow-focus)] peer-disabled:opacity-50" />
      <span className="pointer-events-none relative left-[3px] size-[14px] flex-none rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-soft)] peer-checked:translate-x-[14px]" />
    </label>
  )
}

export { Switch }
