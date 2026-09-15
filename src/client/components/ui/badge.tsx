import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * A badge is a signal: a tinted fill with same-hue text, medium weight, no
 * border. A chip is a fact and stays gray. Neither is bold, and a value that is
 * merely alarming (a date, a delta) is coloured text instead of either.
 */
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none", {
  variants: {
    tone: {
      chip: "bg-sunken text-muted font-normal rounded-xs",
      info: "bg-info-tint text-info",
      success: "bg-success-tint text-success",
      warning: "bg-warning-tint text-warning",
      danger: "bg-danger-tint text-danger",
      accent: "bg-accent-tint text-accent-text",
    },
  },
  defaultVariants: { tone: "chip" },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
