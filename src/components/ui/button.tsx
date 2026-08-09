import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // L'état désactivé suit le Button du design system :
  // `cursor:not-allowed; opacity:.5; transform:none; box-shadow:none`.
  // `cursor-not-allowed` exige que le bouton reçoive encore les événements de
  // pointeur — d'où `enabled:` sur les règles de survol, plutôt que le
  // `pointer-events-none` qui les neutralisait toutes en bloc (et masquait
  // aussi le curseur d'interdiction).
  "inline-flex shrink-0 items-center justify-center gap-[0.5em] rounded-[var(--radius-md)] border border-transparent font-semibold tracking-[0.005em] leading-none whitespace-nowrap no-underline transition-[background-color,transform,box-shadow,border-color] duration-[var(--dur-fast)] ease-[var(--ease-soft)] outline-none select-none focus-visible:shadow-[var(--shadow-focus)] enabled:active:translate-y-[0.5px] enabled:active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--action-bg)] text-[var(--action-fg)] shadow-[var(--shadow-xs)] enabled:hover:bg-[var(--action-bg-hover)] enabled:active:bg-[var(--action-bg-press)]",
        secondary:
          "bg-[var(--action2-bg)] text-[var(--action2-fg)] shadow-[var(--shadow-xs)] enabled:hover:bg-[var(--action2-bg-hover)]",
        ink: "bg-[var(--actionink-bg)] text-[var(--actionink-fg)] shadow-[var(--shadow-xs)] enabled:hover:bg-[var(--actionink-bg-hover)]",
        ghost:
          "bg-[var(--surface-card)] text-[var(--text-strong)] border-[var(--border-strong)] enabled:hover:bg-[var(--surface-sunken)] enabled:hover:border-[var(--tan-300)]",
        danger:
          "bg-[var(--danger)] text-[var(--on-ink)] shadow-[var(--shadow-xs)] enabled:hover:bg-[var(--danger-strong)]",
        // Alias historique vers `ghost` — la vitrine (hors périmètre du chantier,
        // src/app/[locale]/page.tsx) référence encore ce nom.
        outline:
          "bg-[var(--surface-card)] text-[var(--text-strong)] border-[var(--border-strong)] enabled:hover:bg-[var(--surface-sunken)] enabled:hover:border-[var(--tan-300)]",
      },
      size: {
        sm: "text-[13px] px-3.5 py-2",
        md: "text-[14.5px] px-[18px] py-[11px]",
        lg: "text-base px-6 py-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Ajoute une flèche (Lucide `ArrowRight`) après le libellé. */
    trailingArrow?: boolean
  }

function Button({
  className,
  variant,
  size,
  trailingArrow = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
      {trailingArrow && <ArrowRight className="size-4" strokeWidth={1.75} />}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
