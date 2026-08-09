import * as React from "react"

import { cn } from "@/lib/utils"

type TagProps = React.ComponentProps<"span"> & {
  ghost?: boolean
}

/**
 * Tag — chip monospace pour un code/tag d'atelier ("#AD8G45"). Le
 * design system utilise une pile ui-monospace ; on lui préfère `font-mono`
 * (Geist Mono, déjà chargée via next/font) plutôt que redéclarer une pile
 * système parallèle.
 */
function Tag({ ghost = false, className, ...props }: TagProps) {
  return (
    <span
      data-slot="tag"
      className={cn(
        "inline-flex items-center rounded-[var(--radius-xs)] border border-[var(--tan-300)] bg-[var(--tan-100)] px-2 py-[3px] font-mono text-xs leading-none font-semibold tracking-[0.06em] text-[var(--tan-700)]",
        ghost && "bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Tag }
