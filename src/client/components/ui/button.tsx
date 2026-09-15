import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Four variants, and exactly one `primary` per screen.
 *
 * 28px tall at an 8px corner: a full-round button reads consumer, this tier
 * reads tool. Secondary's edge is a shadow ring rather than a border, which
 * stays crisp at this height and costs no layout.
 */
const buttonVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm text-[0.9375rem] font-medium leading-none transition-[background-color,box-shadow,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06),0_2px_4px_-2px_rgb(20_20_20/0.12)]",
        secondary: "raised bg-surface text-foreground hover:bg-sunken",
        ghost: "text-muted hover:bg-sunken hover:text-foreground",
        danger: "bg-danger-tint text-danger hover:bg-danger-solid hover:text-on-primary",
      },
      size: {
        // The leading-icon side is 2px tighter, an optical correction that only
        // holds when the button hugs its label.
        default: "h-7 py-1 pl-1.5 pr-2",
        // Stretched buttons centre their content and go symmetric, or they read
        // as a list row that happens to be filled.
        block: "h-7 w-full justify-center px-2",
        icon: "h-7 w-7 justify-center p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        // A button inside a form defaults to submitting it, which is how a
        // "Cancel" quietly saves the record it was meant to abandon.
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
