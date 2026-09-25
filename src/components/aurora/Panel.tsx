import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "aside";
  /** Serif heading shown above a rule. */
  title?: React.ReactNode;
  /** Small text on the right of the heading row, for a count or a link. */
  aside?: React.ReactNode;
};

/**
 * A section of the page. No box, no background: a heading, a rule, then content.
 */
export function Panel({ className, as: Tag = "section", title, aside, children, ...props }: Props) {
  return (
    <Tag className={cn("min-w-0", className)} {...props}>
      {(title || aside) && (
        <div className="mb-3 flex items-end justify-between gap-4 border-b border-ink pb-2">
          {title ? <h2 className="section-title">{title}</h2> : <span />}
          {aside && <div className="label pb-0.5">{aside}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("section-title", className)} {...props} />;
}
