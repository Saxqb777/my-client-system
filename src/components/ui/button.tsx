import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-medium transition-[background,transform,box-shadow,border-color,color] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-ink shadow-[0_8px_24px_-10px_color-mix(in_oklab,var(--teal)_70%,transparent)] hover:brightness-110 hover:shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--teal)_90%,transparent)]",
        secondary:
          "border border-border bg-surface-2 text-text hover:bg-surface-3 hover:border-border-strong",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
        outline: "border border-border-strong bg-transparent text-text hover:bg-surface-2",
        danger:
          "border border-[color-mix(in_oklab,var(--bad)_40%,transparent)] bg-[color-mix(in_oklab,var(--bad)_12%,transparent)] text-bad hover:bg-[color-mix(in_oklab,var(--bad)_20%,transparent)]",
        link: "text-teal underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-[10px]",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9 rounded-[10px]",
        "icon-sm": "size-8 rounded-[8px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
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
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
