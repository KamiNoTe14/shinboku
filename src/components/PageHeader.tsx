import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-ink-800 px-8 pt-8 pb-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-8 mt-8 max-w-2xl rounded-2xl border border-dashed border-ink-700 p-8">
      <p className="text-xs font-semibold tracking-wider text-glow-400 uppercase">Coming next</p>
      <h2 className="mt-2 text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-300">{children}</div>
    </div>
  );
}
