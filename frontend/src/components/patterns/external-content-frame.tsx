import { ExternalLink } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

/** Share frame policy and an accessible failure fallback for third-party documents. */
export function ExternalContentFrame({
  src,
  title,
  className,
  onError,
  ...props
}: ComponentProps<"iframe"> & { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      {failed && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-background px-4 py-3 text-body-sm text-warning"
          role="alert"
        >
          <span>第三方页面暂时无法显示，请在原站打开。</span>
          <Button variant="outline" size="sm" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              原站打开
            </a>
          </Button>
        </div>
      )}
      <iframe
        {...props}
        src={src}
        title={title}
        referrerPolicy="strict-origin-when-cross-origin"
        className="block min-h-0 w-full flex-1 border-0 bg-white"
        onError={(event) => {
          setFailed(true);
          onError?.(event);
        }}
      />
    </div>
  );
}
