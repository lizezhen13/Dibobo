import { PencilLine } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { FormField, InlineAlert, LoadingButton } from "../../components/patterns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
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
  const [note, setNote] = useState(() => item?.note ?? "");

  const save = async () => {
    if (!item) return;
    try {
      await mutation.mutateAsync({ id: item.id, payload: { note: note.trim() || null } });
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the user can retry.
    }
  };

  const errorMessage = mutation.error instanceof ApiError ? mutation.error.message : mutation.error ? "备注保存失败，请稍后重试" : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <PencilLine size={18} />
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle>编辑备注</DialogTitle>
            <DialogDescription>{item ? `${item.ticker} · ${item.name}` : "编辑自选标的的观察备注"}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="px-6 py-6">
          <FormField label="观察备注" hint={`${note.length}/1000`}>
            <Textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 1000))}
              className="min-h-32"
              placeholder="记录你的观察重点（可选）"
            />
          </FormField>
          {errorMessage && <InlineAlert className="mt-4">{errorMessage}</InlineAlert>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" className="!text-[12px]" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            取消
          </Button>
          <LoadingButton type="button" onClick={() => void save()} loading={mutation.isPending} disabled={!item}>
            保存备注
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
