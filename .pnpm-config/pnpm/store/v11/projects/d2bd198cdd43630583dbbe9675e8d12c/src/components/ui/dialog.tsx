import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const dialogContentVariants = cva(
  "dialog-content relative flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden [&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col [&>form]:overflow-hidden overscroll-contain rounded-2xl border border-border bg-background p-0 shadow-dialog outline-none will-change-transform data-[state=closed]:animate-[dialog-out_150ms_ease-in] data-[state=open]:animate-[dialog-in_220ms_cubic-bezier(.22,1,.36,1)]",
  {
    variants: {
      size: {
        sm: "w-[min(26.25rem,calc(100vw-2rem))]",
        md: "w-[min(35rem,calc(100vw-2rem))]",
        lg: "w-[min(48.75rem,calc(100vw-2rem))]",
        xl: "w-[min(60rem,calc(100vw-2rem))]",
        "fullscreen-mobile":
          "w-[min(48.75rem,calc(100vw-2rem))] max-md:max-h-[calc(100dvh-1.5rem)] max-md:w-[calc(100vw-1.5rem)] max-md:rounded-xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>, VariantProps<typeof dialogContentVariants> {}

export function DialogContent({ className, children, size, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px] data-[state=closed]:animate-[fade-out_150ms_ease-in] data-[state=open]:animate-[fade-in_180ms_ease-out]" />
      {/* 使用 flex 容器居中弹窗，避免 transform 与动画 keyframes 冲突导致左上角闪现 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Content className={cn(dialogContentVariants({ size }), className)} {...props}>
          {children}
          <DialogPrimitive.Close className="absolute right-3 top-3 z-20 grid size-11 place-items-center rounded-lg text-subtle transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X size={18} />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("shrink-0 border-b border-line bg-background px-6 py-5 pr-14", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-heading tracking-tight text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-2 text-body leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex shrink-0 flex-wrap justify-end gap-3 border-t border-line bg-background px-6 py-4", className)} {...props} />
  );
}
