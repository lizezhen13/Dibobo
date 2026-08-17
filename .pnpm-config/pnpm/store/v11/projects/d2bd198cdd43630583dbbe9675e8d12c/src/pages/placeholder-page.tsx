import type { LucideIcon } from "lucide-react";
import { PageContainer } from "../components/patterns";
import { Card, CardContent } from "../components/ui/card";

interface PlaceholderPageProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function PlaceholderPage({ eyebrow, title, description, icon: Icon }: PlaceholderPageProps) {
  return (
    <PageContainer size="wide">
      <div className="mb-8">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>

      <Card variant="dashed" className="grid min-h-[400px] place-items-center bg-transparent">
        <CardContent className="text-center">
          {Icon ? (
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-primary/20 bg-primary/5 text-primary/80">
              <Icon size={26} strokeWidth={1.6} />
            </div>
          ) : (
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-primary/20 bg-primary/5 text-primary/80">
              <span className="font-display text-2xl">?</span>
            </div>
          )}
          <p className="text-[1.1rem] font-medium text-foreground">页面正在开发中</p>
          <p className="mt-2 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
            {description ? "该功能将在后续版本上线，敬请期待。" : "该页面将在后续版本上线，敬请期待。"}
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
