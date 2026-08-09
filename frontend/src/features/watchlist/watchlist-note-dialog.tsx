import { LoaderCircle, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { ApiError } from "../../lib/api";
import type { WatchlistItem } from "./types";
import { useUpdateWatchlistMutation } from "./queries";

interface WatchlistNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WatchlistItem | null;
}

export function WatchlistNoteDialog({ open, onOpenChange, item }: WatchlistNoteDialogProps) {
  const mutation = useUpdateWatchlistMutation();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setNote(item?.note ?? "");
    mutation.reset();
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!item) return;
    try {
      await mutation.mutateAsync({ id: item.id, payload: { note: note.trim() || null } });
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the user can retry.
    }
  };

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? "备注保存失败，请稍后重试"
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,calc(100vw-48px))]">
        <DialogHeader className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <PencilLine size={18} />
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle>编辑备注</DialogTitle>
            <DialogDescription>
              {item ? `${item.ticker} · ${item.name}` : "编辑自选标的的观察备注"}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="px-6 py-6">
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground">
              观察备注
              <span className="font-mono text-[0.7rem] font-normal tracking-normal text-muted-foreground/60">{note.length}/1000</span>
            </span>
            <textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 1000))}
              className="min-h-32 w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-[0.95rem] leading-7 text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-[3px] focus:ring-primary/15"
              placeholder="记录你的观察重点（可选）"
            />
          </label>
          {errorMessage && (
            <div role="alert" className="mt-4 rounded-lg border-l-4 border-market-up bg-market-up/6 px-4 py-3 text-[0.9rem] text-danger">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" className="!text-[12px]" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            取消
          </Button>
          <Button type="button" className="!text-[12px]" onClick={() => void save()} disabled={!item || mutation.isPending}>
            {mutation.isPending && <LoaderCircle className="animate-spin" size={15} />}
            保存备注
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
