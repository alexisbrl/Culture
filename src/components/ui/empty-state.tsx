import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/** État vide réutilisable — jamais un blanc : icône, titre, phrase, action facultative. */
function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[15px] font-semibold text-[var(--text-strong)]">{title}</div>
        {description && <div className="text-sm text-[var(--text-muted)]">{description}</div>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
