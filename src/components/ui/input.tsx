import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-input)] px-[13px] py-[11px] text-[14.5px] leading-[1.3] text-[var(--text-strong)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-soft)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--text-strong)] placeholder:text-[var(--text-faint)] hover:border-[var(--tan-300)] focus:border-[var(--green-500)] focus:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--alert-500)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
