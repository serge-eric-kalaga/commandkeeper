import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
    Command as CommandRoot,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from "@/components/ui/command";
import { Command } from "@/hooks/useCommandVault";
import { toast } from "@/components/ui/sonner";

type ParsedSearch = {
    text: string;
    tags: string[];
    groupName?: string;
    isFavorite?: boolean;
};

interface Props {
    open: boolean;
    onClose: () => void;
    groups: Array<{ id: number; name: string }>;
    search: (q: string, options?: { groupId?: number; limit?: number; tags?: string[]; isFavorite?: boolean; signal?: AbortSignal }) => Promise<Command[]>;
    getTopCopied: (limit?: number) => Promise<Command[]>;
    onPick: (cmd: Command) => void;
    parseAdvancedSearch: (input: string) => ParsedSearch;
}

export default function CommandPalette({ open, onClose, groups, search, getTopCopied, onPick, parseAdvancedSearch }: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<Command[]>([]);
    const [topLoading, setTopLoading] = useState(false);
    const [topItems, setTopItems] = useState<Command[]>([]);

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setItems([]);
        setLoading(false);
        setTopLoading(true);
        setTopItems([]);

        const t = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        void (async () => {
            try {
                const res = await getTopCopied(10);
                if (cancelled) return;
                setTopItems(res);
            } catch {
                if (cancelled) return;
                setTopItems([]);
            } finally {
                if (cancelled) return;
                setTopLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, getTopCopied]);

    const parsed = useMemo(() => parseAdvancedSearch(query), [query, parseAdvancedSearch]);

    useEffect(() => {
        if (!open) return;

        const q = query.trim();
        if (!q) {
            setItems([]);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        let cancelled = false;

        const t = window.setTimeout(() => {
            setLoading(true);

            let groupId: number | undefined;
            if (parsed.groupName) {
                const match = groups.find((g) => g.name.toLowerCase() === parsed.groupName!.toLowerCase());
                if (!match) {
                    setItems([]);
                    setLoading(false);
                    return;
                }
                groupId = match.id;
            }

            void search(parsed.text || q, {
                groupId,
                tags: parsed.tags,
                isFavorite: parsed.isFavorite,
                limit: 30,
                signal: controller.signal,
            })
                .then((res) => {
                    if (cancelled) return;
                    setItems(res);
                })
                .catch((err: any) => {
                    if (cancelled) return;
                    if (err?.name === "AbortError") return;
                    setItems([]);
                })
                .finally(() => {
                    if (cancelled) return;
                    setLoading(false);
                });
        }, 200);

        return () => {
            cancelled = true;
            controller.abort();
            window.clearTimeout(t);
        };
    }, [open, query, parsed.text, parsed.tags.join("|"), parsed.groupName, parsed.isFavorite, groups, search]);

    if (!open) return null;

    const hasQuery = query.trim().length > 0;
    const visibleItems = hasQuery ? items : topItems;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl mt-10 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-fade-in">
                <CommandRoot className="bg-card">
                    <CommandInput
                        ref={inputRef}
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Search commands… (supports tag:, group:, fav:)"
                    />

                    <CommandList className="max-h-[360px]">
                        {(loading || topLoading) && (
                            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {hasQuery ? "Searching…" : "Loading…"}
                            </div>
                        )}

                        <CommandEmpty>{hasQuery ? "No results." : "No commands yet."}</CommandEmpty>

                        <CommandGroup heading={hasQuery ? "Results" : "Top copied"}>
                            {visibleItems.map((c) => (
                                <CommandItem
                                    key={c.id}
                                    value={`${c.title} ${c.command} ${c.tags.join(" ")}`}
                                    onSelect={() => {
                                        onPick(c);
                                        const hasVars = /\{\{\w+\}\}/.test(c.command);
                                        if (!hasVars) {
                                            toast.success("Copied");
                                        }
                                        onClose();
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">{c.title}</div>
                                        <div className="text-[11px] text-muted-foreground truncate font-mono">{c.command}</div>
                                    </div>
                                    <CommandShortcut>{c.copyCount}</CommandShortcut>
                                </CommandItem>
                            ))}
                        </CommandGroup>

                        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
                            <span>Enter to copy</span>
                            <span>Esc to close</span>
                        </div>
                    </CommandList>
                </CommandRoot>
            </div>
        </div>
    );
}
