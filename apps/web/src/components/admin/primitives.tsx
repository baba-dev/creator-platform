import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

export { ConfirmDialog } from "./confirm-dialog";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  const tones: Record<StatusTone, string> = {
    neutral: "border-border bg-muted text-muted-foreground",
    info: "border-info/20 bg-info/10 text-info",
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/25 bg-warning/10 text-warning",
    danger: "border-destructive/20 bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function DataTable({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        aria-label={label}
        className="w-full min-w-[620px] border-collapse text-left"
      >
        {children}
      </table>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-end">
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Icon name={icon} />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  hasNext,
  basePath,
  query = {},
}: {
  page: number;
  hasNext: boolean;
  basePath: string;
  query?: Record<string, string>;
}) {
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams(query);
    params.set("page", targetPage.toString());
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-border pt-4"
    >
      {page <= 1 ? (
        <Button variant="secondary" size="sm" disabled>
          Previous
        </Button>
      ) : (
        <Button asChild variant="secondary" size="sm">
          <a href={pageHref(page - 1)}>Previous</a>
        </Button>
      )}
      <span className="font-mono text-xs text-muted-foreground">
        Page {page}
      </span>
      {hasNext ? (
        <Button asChild variant="secondary" size="sm">
          <a href={pageHref(page + 1)}>Next</a>
        </Button>
      ) : (
        <Button variant="secondary" size="sm" disabled>
          Next
        </Button>
      )}
    </nav>
  );
}
