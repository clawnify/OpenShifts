import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-16 w-full rounded-sm bg-surface px-3 py-2 text-[0.9375rem] text-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-shadow duration-150 ease-out",
        "placeholder:text-faint focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--accent-tint)]",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
