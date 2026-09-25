import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-[13px] font-medium transition-[background,border-color,color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 select-none",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:opacity-90",
        secondary: "border border-border-strong bg-transparent text-text hover:bg-surface-2",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
        outline: "border border-border-strong bg-transparent text-text hover:bg-surface-2",
        danger: "border border-[color-mix(in_oklab,var(--bad)_50%,var(--border))] bg-transparent text-bad hover:bg-[color-mix(in_oklab,var(--bad)_8%,transparent)]",
        link: "text-text underline underline-offset-4 decoration-border-strong hover:decoration-text px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-3.5 text-[14px]",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
