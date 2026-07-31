import type { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export function PlaceholderPage({ eyebrow, title, description, icon: Icon }: PlaceholderPageProps) {
  return (
    <div className="mx-auto w-full max-w-[1500px] animate-enter">
      <p className="font-mono text-[10px] tracking-[.18em] text-accent-deep">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[34px] tracking-[-.025em]">{title}</h1>
      <div className="paper-grid mt-8 grid min-h-[520px] place-items-center rounded-[5px] border border-line bg-paper">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full border border-line bg-paper-deep text-ink-muted">
            <Icon size={22} strokeWidth={1.5} />
          </div>
          <p className="mt-5 font-display text-xl">模块入口已就位</p>
          <p className="mt-3 text-sm leading-7 text-ink-muted">{description}</p>
          <p className="mt-5 font-mono text-[10px] tracking-[.15em] text-ink-faint">NEXT DEVELOPMENT SLICE</p>
        </div>
      </div>
    </div>
  );
}

