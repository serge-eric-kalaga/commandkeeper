import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { Command, Group, VaultData } from "@/hooks/useCommandVault";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";

type ExportFormat = "json" | "csv" | "pdf";

type ExportFieldOptions = {
    description: boolean;
    tags: boolean;
    variables: boolean;
    favorite: boolean;
    copyCount: boolean;
};

type ExportFilters = {
    useCurrentView: boolean;
    favoritesOnly: boolean;
    groupIds: number[];
    tags: string[];
};

type ApiCommandsPageResponse = {
    items: Array<{
        id: number;
        group_id: number;
        title: string;
        command: string;
        description: string | null;
        default_variables: Record<string, string>;
        tags: string[];
        is_favorite: boolean;
        copy_count: number;
        created_at: string;
        updated_at: string;
    }>;
    total: number;
    limit: number;
    offset: number;
};

function mapApiCommand(c: ApiCommandsPageResponse["items"][number]): Command {
    return {
        id: c.id,
        groupId: c.group_id,
        title: c.title,
        command: c.command,
        description: c.description,
        defaultVariables: c.default_variables ?? {},
        tags: c.tags,
        isFavorite: c.is_favorite,
        copyCount: c.copy_count,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
    };
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
    const s = value == null ? "" : String(value);
    if (/[\r\n",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

async function fetchAllCommands(
    token: string,
    opts: { groupId?: number; favoritesOnly?: boolean; tags?: string[]; q?: string },
): Promise<Command[]> {
    const limit = 200;
    let offset = 0;
    const out: Command[] = [];
    while (true) {
        const page = await apiRequest<ApiCommandsPageResponse>("/commands/paged", {
            token,
            query: {
                group_id: opts.groupId,
                is_favorite: opts.favoritesOnly ? true : undefined,
                q: opts.q,
                tag: opts.tags,
                limit,
                offset,
            },
        });

        const items = page.items.map(mapApiCommand);
        out.push(...items);
        offset += items.length;
        if (offset >= page.total || items.length === 0) break;
    }
    return out;
}

async function buildExportPayload(
    token: string,
    allGroups: Group[],
    filters: ExportFilters & { q?: string },
): Promise<{ groups: Group[]; commands: Command[] }> {
    const groupIds = filters.groupIds;

    let commands: Command[] = [];
    if (groupIds.length === 0) {
        commands = await fetchAllCommands(token, {
            favoritesOnly: filters.favoritesOnly,
            tags: filters.tags,
            q: filters.q,
        });
    } else {
        const merged = new Map<number, Command>();
        for (const gid of groupIds) {
            const items = await fetchAllCommands(token, {
                groupId: gid,
                favoritesOnly: filters.favoritesOnly,
                tags: filters.tags,
                q: filters.q,
            });
            for (const c of items) merged.set(c.id, c);
        }
        commands = Array.from(merged.values());
    }

    const includedGroupIds = new Set<number>();
    for (const c of commands) includedGroupIds.add(c.groupId);

    const groups = allGroups.filter((g) => includedGroupIds.has(g.id));
    return { groups, commands };
}

async function exportToPdf(
    payload: { groups: Group[]; commands: Command[] },
    opts: { fields: ExportFieldOptions },
) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const mono = await doc.embedFont(StandardFonts.Courier);

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 32;
    const lineHeight = 14;
    const fontSize = 11;
    const titleSize = 14;
    const smallSize = 9;
    const codeSize = 9.5;

    const groupById = new Map(payload.groups.map((g) => [g.id, g] as const));

    const parseHex = (hex: string | undefined | null) => {
        const raw = (hex ?? "").trim();
        if (!raw) return null;
        const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
        if (!m) return null;
        const v = m[1];
        const r = parseInt(v.slice(0, 2), 16) / 255;
        const g = parseInt(v.slice(2, 4), 16) / 255;
        const b = parseInt(v.slice(4, 6), 16) / 255;
        return { r, g, b };
    };

    const wrap = (text: string, maxWidth: number, f = font, size = fontSize) => {
        const words = text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = "";

        for (const w of words) {
            const test = current ? `${current} ${w}` : w;
            const width = f.widthOfTextAtSize(test, size);
            if (width <= maxWidth) {
                current = test;
            } else {
                if (current) lines.push(current);
                current = w;
            }
        }
        if (current) lines.push(current);
        return lines;
    };

    const baselineForCenteredText = (boxY: number, boxH: number, f: any, size: number) => {
        const height = typeof f?.heightAtSize === "function" ? f.heightAtSize(size) : size;
        const descent = typeof f?.descentAtSize === "function" ? f.descentAtSize(size) : -size * 0.25;
        // yMin = baseline + descent
        // Want yMin = boxY + (boxH - height)/2
        return boxY + (boxH - height) / 2 - descent;
    };

    let page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    let pageNumber = 1;

    const colors = {
        text: rgb(0, 0, 0),
        muted: rgb(0.35, 0.35, 0.35),
        border: rgb(0.9, 0.9, 0.9),
        surface: rgb(1, 1, 1),
        codeBg: rgb(0.965, 0.965, 0.965),
    };

    const drawText = (text: string, x: number, yy: number, f = font, size = fontSize, color = colors.text) => {
        page.drawText(text, { x, y: yy, size, font: f, color });
    };

    const drawHr = (yy: number) => {
        page.drawLine({
            start: { x: margin, y: yy },
            end: { x: pageWidth - margin, y: yy },
            thickness: 1,
            color: colors.border,
        });
    };

    const ensureSpace = (needed: number) => {
        if (y - needed < margin) {
            page = doc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
            pageNumber += 1;
        }
    };

    const drawHeader = () => {
        // Top title
        drawText("Command Keeper", margin, y, bold, titleSize);
        const dateStr = new Date().toISOString().slice(0, 10);
        const right = `Export · ${dateStr}`;
        const w = font.widthOfTextAtSize(right, fontSize);
        drawText(right, pageWidth - margin - w, y + 2, font, fontSize, colors.muted);
        y -= 18;
        const subtitle = `${payload.commands.length} commands`;
        drawText(subtitle, margin, y, font, fontSize, colors.muted);
        y -= 10;
        drawHr(y);
        y -= 14;
    };

    const drawFooter = () => {
        const footer = `Page ${pageNumber}`;
        const w = font.widthOfTextAtSize(footer, smallSize);
        drawText(footer, pageWidth - margin - w, margin - 16, font, smallSize, colors.muted);
    };

    drawHeader();

    const maxTextWidth = pageWidth - margin * 2;

    // To keep the drawing order correct, we render each card in two passes:
    // 1) Measure by simulating layout to compute height.
    // 2) Draw background + stripe, then draw the content.

    const measureCard = (cmd: Command) => {
        const group = groupById.get(cmd.groupId);
        const stripeW = 3;
        const cardPadding = 10;
        const titleTopMargin = 4;
        const tagsToVarsGap = 8;
        const cardW = maxTextWidth;
        let h = cardPadding * 2 + 2 + titleTopMargin;
        // title
        h += 16;
        // meta (up to 2 lines typically)
        const metaParts: string[] = [];
        if (group) metaParts.push(`Group: ${group.name}`);
        if (opts.fields.favorite) metaParts.push(cmd.isFavorite ? "Fav: yes" : "Fav: no");
        if (opts.fields.copyCount) metaParts.push(`Copied: ${cmd.copyCount}`);
        if (metaParts.length > 0) {
            const meta = metaParts.join(" · ");
            const lines = wrap(meta, cardW - stripeW - cardPadding * 2, font, smallSize);
            h += lines.length * 12 + 2;
        }
        // code block
        const codeW = cardW - stripeW - cardPadding * 2;
        const codePadX = 8;
        const codePadY = 7;
        const codeLineH = 12;
        const codeLines = wrap(`$ ${cmd.command}`, codeW - codePadX * 2, mono, codeSize);
        const codeRectH = codePadY * 2 + codeLines.length * codeLineH;
        h += codeRectH + 8;
        // description
        if (opts.fields.description && cmd.description) {
            const descLines = wrap(cmd.description, cardW - stripeW - cardPadding * 2, font, fontSize);
            h += descLines.length * lineHeight + 2;
        }
        // tags
        if (opts.fields.tags && cmd.tags.length > 0) {
            const availableW = cardW - stripeW - cardPadding * 2;
            let lineW = 0;
            let lines = 1;
            for (const t of cmd.tags) {
                const pillW = font.widthOfTextAtSize(t, smallSize) + 12;
                if (lineW === 0) {
                    lineW = pillW;
                } else if (lineW + 6 + pillW <= availableW) {
                    lineW += 6 + pillW;
                } else {
                    lines += 1;
                    lineW = pillW;
                }
            }
            h += lines * 18;
        }
        // vars
        if (opts.fields.variables && Object.keys(cmd.defaultVariables ?? {}).length > 0) {
            if (opts.fields.tags && cmd.tags.length > 0) h += tagsToVarsGap;
            const vars = Object.entries(cmd.defaultVariables)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ");
            const varLines = wrap(`Variables: ${vars}`, cardW - stripeW - cardPadding * 2, font, smallSize);
            h += varLines.length * 12;
        }
        return h;
    };

    const renderCard = (cmd: Command) => {
        const group = groupById.get(cmd.groupId);
        const accentHex = parseHex(group?.color);
        const accent = accentHex ? rgb(accentHex.r, accentHex.g, accentHex.b) : rgb(0, 0, 0);

        const cardPadding = 10;
        const stripeW = 3;
        const titleTopMargin = 4;
        const tagsToVarsGap = 8;
        const cardW = maxTextWidth;
        const cardH = measureCard(cmd);
        const cardBottomY = y - cardH;

        // Background + stripe first
        page.drawRectangle({
            x: margin,
            y: cardBottomY,
            width: cardW,
            height: cardH,
            color: colors.surface,
            borderColor: colors.border,
            borderWidth: 0.75,
        });
        page.drawRectangle({ x: margin, y: cardBottomY, width: stripeW, height: cardH, color: accent });

        // Content
        let cursorY = y - cardPadding - titleTopMargin;
        const contentX = margin + stripeW + cardPadding;
        const contentW = cardW - stripeW - cardPadding * 2;

        drawText(cmd.title, contentX, cursorY, bold, 12, colors.text);
        cursorY -= 16;

        const metaParts: string[] = [];
        if (group) metaParts.push(`Group: ${group.name}`);
        if (opts.fields.favorite) metaParts.push(cmd.isFavorite ? "Fav: yes" : "Fav: no");
        if (opts.fields.copyCount) metaParts.push(`Copied: ${cmd.copyCount}`);
        if (metaParts.length > 0) {
            const meta = metaParts.join(" · ");
            const metaLines = wrap(meta, contentW, font, smallSize);
            for (const line of metaLines) {
                drawText(line, contentX, cursorY, font, smallSize, colors.muted);
                cursorY -= 12;
            }
            cursorY -= 2;
        }

        const codePadX = 8;
        const codePadY = 7;
        const codeLineH = 12;
        const afterCodeGap = 12;
        const codeLines = wrap(`$ ${cmd.command}`, contentW - codePadX * 2, mono, codeSize);
        const codeRectH = codePadY * 2 + codeLines.length * codeLineH;
        const codeRectY = cursorY - codeRectH;
        page.drawRectangle({
            x: contentX,
            y: codeRectY,
            width: contentW,
            height: codeRectH,
            color: colors.codeBg,
            borderColor: colors.border,
            borderWidth: 0.75,
        });
        let codeTextY = cursorY - codePadY - codeSize;
        for (const line of codeLines) {
            drawText(line, contentX + codePadX, codeTextY, mono, codeSize, colors.text);
            codeTextY -= codeLineH;
        }
        cursorY = codeRectY - afterCodeGap;

        if (opts.fields.description && cmd.description) {
            const descLines = wrap(cmd.description, contentW, font, fontSize);
            for (const line of descLines) {
                drawText(line, contentX, cursorY, font, fontSize, colors.text);
                cursorY -= lineHeight;
            }
            cursorY -= 2;
        }

        if (opts.fields.tags && cmd.tags.length > 0) {
            let tx = contentX;
            const pillPadX = 6;
            const pillH = 14;
            const gap = 6;
            for (const t of cmd.tags) {
                const textW = font.widthOfTextAtSize(t, smallSize);
                const pillW = textW + pillPadX * 2;
                if (tx + pillW > contentX + contentW) {
                    cursorY -= 18;
                    tx = contentX;
                }
                const pillY = cursorY - pillH;
                const textY = baselineForCenteredText(pillY, pillH, font, smallSize);
                page.drawRectangle({
                    x: tx,
                    y: pillY,
                    width: pillW,
                    height: pillH,
                    color: accent,
                    opacity: 0.08,
                });
                drawText(t, tx + pillPadX, textY, font, smallSize, accent);
                tx += pillW + gap;
            }
            cursorY -= 18;
        }

        if (opts.fields.variables && Object.keys(cmd.defaultVariables ?? {}).length > 0) {
            if (opts.fields.tags && cmd.tags.length > 0) {
                cursorY -= tagsToVarsGap;
            }
            const vars = Object.entries(cmd.defaultVariables)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ");
            const varLines = wrap(`Variables: ${vars}`, contentW, font, smallSize);
            for (const line of varLines) {
                drawText(line, contentX, cursorY, font, smallSize, colors.muted);
                cursorY -= 12;
            }
        }

        y = cardBottomY - 12;
    };

    const sorted = payload.commands.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    for (const c of sorted) {
        const needed = measureCard(c) + 14;
        if (y - needed < margin) {
            drawFooter();
            page = doc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
            pageNumber += 1;
            drawHeader();
        }
        renderCard(c);
    }

    drawFooter();

    const bytes = await doc.save();
    return new Blob([bytes], { type: "application/pdf" });
}

export default function ExportModal(props: {
    open: boolean;
    onClose: () => void;
    token: string;
    groups: Group[];
    currentView: { groupId?: number; favoritesOnly?: boolean; tags: string[]; q?: string };
    selectionCommands?: Command[];
}) {
    const { open, onClose, token, groups, currentView, selectionCommands } = props;

    const selectionMode = (selectionCommands?.length ?? 0) > 0;

    const [format, setFormat] = useState<ExportFormat>("json");
    const [filters, setFilters] = useState<ExportFilters>({
        useCurrentView: true,
        favoritesOnly: false,
        groupIds: [],
        tags: [],
    });

    const [fields, setFields] = useState<ExportFieldOptions>({
        description: true,
        tags: true,
        variables: true,
        favorite: true,
        copyCount: true,
    });

    const [tagList, setTagList] = useState<string[]>([]);
    const [tagSearch, setTagSearch] = useState("");
    const [groupSearch, setGroupSearch] = useState("");

    const [loadingTags, setLoadingTags] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Init/reset when opening
    useEffect(() => {
        if (!open) return;
        setFormat("json");
        setFilters({
            useCurrentView: !selectionMode,
            favoritesOnly: currentView.favoritesOnly ?? false,
            groupIds: currentView.groupId != null ? [currentView.groupId] : [],
            tags: currentView.tags ?? [],
        });
        setFields({ description: true, tags: true, variables: true, favorite: true, copyCount: true });
        setTagSearch("");
        setGroupSearch("");
    }, [open, currentView.favoritesOnly, currentView.groupId, currentView.tags, selectionMode]);

    useEffect(() => {
        if (!open) return;
        if (selectionMode) return;
        setLoadingTags(true);
        apiRequest<string[]>("/tags", { token })
            .then((tags) => setTagList(tags))
            .catch(() => setTagList([]))
            .finally(() => setLoadingTags(false));
    }, [open, token, selectionMode]);

    const effective = useMemo(() => {
        if (filters.useCurrentView) {
            return {
                favoritesOnly: currentView.favoritesOnly ?? false,
                groupIds: currentView.groupId != null ? [currentView.groupId] : [],
                tags: currentView.tags ?? [],
                q: currentView.q,
            };
        }
        return {
            favoritesOnly: filters.favoritesOnly,
            groupIds: filters.groupIds,
            tags: filters.tags,
            q: undefined,
        };
    }, [currentView.favoritesOnly, currentView.groupId, currentView.tags, currentView.q, filters.favoritesOnly, filters.groupIds, filters.tags, filters.useCurrentView]);

    const filteredGroups = useMemo(() => {
        const q = groupSearch.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter((g) => `${g.name} ${g.icon}`.toLowerCase().includes(q));
    }, [groupSearch, groups]);

    const filteredTags = useMemo(() => {
        const q = tagSearch.trim().toLowerCase();
        if (!q) return tagList;
        return tagList.filter((t) => t.toLowerCase().includes(q));
    }, [tagList, tagSearch]);

    const toggle = (list: string[], value: string) =>
        list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

    const toggleNum = (list: number[], value: number) =>
        list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

    const exportNow = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const payload = selectionMode
                ? (() => {
                    const cmds = selectionCommands ?? [];
                    const includedGroupIds = new Set(cmds.map((c) => c.groupId));
                    return { groups: groups.filter((g) => includedGroupIds.has(g.id)), commands: cmds };
                })()
                : await buildExportPayload(token, groups, {
                    useCurrentView: filters.useCurrentView,
                    favoritesOnly: effective.favoritesOnly,
                    groupIds: effective.groupIds,
                    tags: effective.tags,
                    q: effective.q,
                });

            const date = new Date().toISOString().slice(0, 10);

            if (format === "json") {
                const json: VaultData = { groups: payload.groups, commands: payload.commands };
                const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
                downloadBlob(blob, `command-keeper-export-${date}.json`);
                onClose();
                return;
            }

            if (format === "csv") {
                const groupById = new Map(payload.groups.map((g) => [g.id, g] as const));

                const cols: Array<{ key: string; label: string; get: (c: Command) => unknown }> = [
                    { key: "title", label: "title", get: (c) => c.title },
                    { key: "command", label: "command", get: (c) => c.command },
                    { key: "group", label: "group", get: (c) => groupById.get(c.groupId)?.name ?? "" },
                ];

                if (fields.description) cols.push({ key: "description", label: "description", get: (c) => c.description ?? "" });
                if (fields.tags) cols.push({ key: "tags", label: "tags", get: (c) => c.tags.join("|") });
                if (fields.variables) cols.push({ key: "default_variables", label: "default_variables", get: (c) => JSON.stringify(c.defaultVariables ?? {}) });
                if (fields.favorite) cols.push({ key: "is_favorite", label: "is_favorite", get: (c) => (c.isFavorite ? "true" : "false") });
                if (fields.copyCount) cols.push({ key: "copy_count", label: "copy_count", get: (c) => c.copyCount });

                const header = cols.map((c) => csvEscape(c.label)).join(",");
                const rows = payload.commands.map((c) => cols.map((col) => csvEscape(col.get(c))).join(","));
                const csv = [header, ...rows].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                downloadBlob(blob, `command-keeper-export-${date}.csv`);
                onClose();
                return;
            }

            if (format === "pdf") {
                const blob = await exportToPdf(payload, { fields });
                downloadBlob(blob, `command-keeper-export-${date}.pdf`);
                onClose();
                return;
            }
        } finally {
            setExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Export</DialogTitle>
                    <DialogDescription>
                        Choose what to export and the output format.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2">Scope</div>
                            {selectionMode ? (
                                <div className="text-sm text-muted-foreground">
                                    Exporting <span className="font-medium text-foreground">{selectionCommands?.length ?? 0}</span> selected command{(selectionCommands?.length ?? 0) === 1 ? "" : "s"}.
                                </div>
                            ) : (
                                <>
                                    <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={filters.useCurrentView}
                                            onCheckedChange={(v) => setFilters((p) => ({ ...p, useCurrentView: Boolean(v) }))}
                                        />
                                        Use current view (recommended)
                                    </label>

                                    {!filters.useCurrentView && (
                                        <div className="mt-3 space-y-3">
                                            <label className="flex items-center gap-2 text-sm">
                                                <Checkbox
                                                    checked={filters.favoritesOnly}
                                                    onCheckedChange={(v) => setFilters((p) => ({ ...p, favoritesOnly: Boolean(v) }))}
                                                />
                                                Favorites only
                                            </label>

                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="text-xs font-medium text-muted-foreground">Groups</div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => setFilters((p) => ({ ...p, groupIds: groups.map((g) => g.id) }))}
                                                    >
                                                        Select all
                                                    </Button>
                                                </div>
                                                <input
                                                    value={groupSearch}
                                                    onChange={(e) => setGroupSearch(e.target.value)}
                                                    placeholder="Search groups..."
                                                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                                                />
                                                <div className="mt-2 border border-border rounded-md">
                                                    <ScrollArea className="h-40">
                                                        <div className="p-2 space-y-2">
                                                            {filteredGroups.map((g) => (
                                                                <label key={g.id} className="flex items-center gap-2 text-sm">
                                                                    <Checkbox
                                                                        checked={filters.groupIds.includes(g.id)}
                                                                        onCheckedChange={() => setFilters((p) => ({ ...p, groupIds: toggleNum(p.groupIds, g.id) }))}
                                                                    />
                                                                    <span className="text-base leading-none">{g.icon}</span>
                                                                    <span className="truncate">{g.name}</span>
                                                                </label>
                                                            ))}
                                                            {filteredGroups.length === 0 && (
                                                                <div className="text-sm text-muted-foreground py-2">No groups</div>
                                                            )}
                                                        </div>
                                                    </ScrollArea>
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">
                                                    Leave empty to export all groups.
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="text-xs font-medium text-muted-foreground">Tags</div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={loadingTags}
                                                        onClick={() => setFilters((p) => ({ ...p, tags: [...tagList] }))}
                                                    >
                                                        Select all
                                                    </Button>
                                                </div>
                                                <input
                                                    value={tagSearch}
                                                    onChange={(e) => setTagSearch(e.target.value)}
                                                    placeholder="Search tags..."
                                                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                                                />
                                                <div className="mt-2 border border-border rounded-md">
                                                    <ScrollArea className="h-40">
                                                        <div className="p-2 space-y-2">
                                                            {loadingTags ? (
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    Loading tags...
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {filteredTags.map((t) => (
                                                                        <label key={t} className="flex items-center gap-2 text-sm">
                                                                            <Checkbox
                                                                                checked={filters.tags.includes(t)}
                                                                                onCheckedChange={() => setFilters((p) => ({ ...p, tags: toggle(p.tags, t) }))}
                                                                            />
                                                                            <span className="truncate">{t}</span>
                                                                        </label>
                                                                    ))}
                                                                    {filteredTags.length === 0 && (
                                                                        <div className="text-sm text-muted-foreground py-2">No tags</div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </ScrollArea>
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">
                                                    Leave empty to export all tags.
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {filters.useCurrentView && (
                                        <div className="mt-2 text-[11px] text-muted-foreground">
                                            Uses: view filters + selected tags + search.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2">Format</div>
                            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                                <label className="flex items-center gap-2 text-sm">
                                    <RadioGroupItem value="json" />
                                    JSON (compatible import)
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <RadioGroupItem value="csv" />
                                    CSV
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <RadioGroupItem value="pdf" />
                                    PDF
                                </label>
                            </RadioGroup>
                        </div>

                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2">Options</div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={fields.description}
                                        onCheckedChange={(v) => setFields((p) => ({ ...p, description: Boolean(v) }))}
                                        disabled={format === "json"}
                                    />
                                    Include description
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={fields.tags}
                                        onCheckedChange={(v) => setFields((p) => ({ ...p, tags: Boolean(v) }))}
                                        disabled={format === "json"}
                                    />
                                    Include tags
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={fields.variables}
                                        onCheckedChange={(v) => setFields((p) => ({ ...p, variables: Boolean(v) }))}
                                        disabled={format === "json"}
                                    />
                                    Include variables
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={fields.favorite}
                                        onCheckedChange={(v) => setFields((p) => ({ ...p, favorite: Boolean(v) }))}
                                        disabled={format === "json"}
                                    />
                                    Include favorite flag
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={fields.copyCount}
                                        onCheckedChange={(v) => setFields((p) => ({ ...p, copyCount: Boolean(v) }))}
                                        disabled={format === "json"}
                                    />
                                    Include copy count
                                </label>
                                {format === "json" && (
                                    <div className="text-[11px] text-muted-foreground">
                                        JSON always exports full objects for import compatibility.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={exporting}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void exportNow()} disabled={exporting}>
                        {exporting && <Loader2 className="w-4 h-4 animate-spin" />}
                        Export
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
