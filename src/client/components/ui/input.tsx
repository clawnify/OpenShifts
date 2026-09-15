import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The edge is an inset ring, so focus thickens it without moving a pixel of
 * layout and the corner radius stays exactly what was asked for.
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-sm bg-surface px-3 text-[0.9375rem] text-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-shadow duration-150 ease-out",
        "placeholder:text-faint focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--accent-tint)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
