import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("field min-h-[96px] resize-y", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
