import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

/** 13px, medium, sentence case. Never uppercase: that style belongs above a number. */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-[0.8125rem] font-medium leading-tight text-muted", className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
