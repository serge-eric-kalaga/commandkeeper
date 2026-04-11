import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Group } from "@/hooks/useCommandVault";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function BulkMoveModal(props: {
    open: boolean;
    groups: Group[];
    count: number;
    onClose: () => void;
    onConfirm: (groupId: number) => Promise<void>;
}) {
    const { open, groups, count, onClose, onConfirm } = props;

    const [groupId, setGroupId] = useState<number | null>(null);
    const [moving, setMoving] = useState(false);

    const sortedGroups = useMemo(() => {
        return [...groups].sort((a, b) => a.name.localeCompare(b.name));
    }, [groups]);

    useEffect(() => {
        if (!open) return;
        setMoving(false);
        setGroupId(sortedGroups[0]?.id ?? null);
    }, [open, sortedGroups]);

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Move commands</DialogTitle>
                    <DialogDescription>
                        Move {count} selected command{count === 1 ? "" : "s"} to a group.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Destination group</label>
                    <select
                        value={groupId ?? ""}
                        onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                        disabled={moving || sortedGroups.length === 0}
                    >
                        {sortedGroups.length === 0 ? (
                            <option value="">No groups</option>
                        ) : (
                            sortedGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.icon} {g.name}
                                </option>
                            ))
                        )}
                    </select>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={moving}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            if (moving || groupId == null) return;
                            void (async () => {
                                try {
                                    setMoving(true);
                                    await onConfirm(groupId);
                                    onClose();
                                } catch {
                                    // Keep open; caller handles feedback.
                                } finally {
                                    setMoving(false);
                                }
                            })();
                        }}
                        disabled={moving || groupId == null}
                    >
                        {moving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Move
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
