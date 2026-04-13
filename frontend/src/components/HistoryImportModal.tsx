import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/apiClient";
import { Group } from "@/hooks/useCommandVault";
import { useTranslation } from "react-i18next";

type PreviewItem = {
    command: string;
    status: "new" | "duplicate" | "noise";
    reason?: string | null;
};

type PreviewResponse = {
    total_lines: number;
    parsed: number;
    created_candidates: number;
    duplicate_candidates: number;
    noise_candidates: number;
    truncated: boolean;
    items: PreviewItem[];
};

type ImportResponse = {
    created: number;
    skipped_duplicates: number;
    skipped_noise: number;
    total_lines: number;
    parsed: number;
};

function parseTags(tagsText: string): string[] {
    return tagsText
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

export default function HistoryImportModal(props: {
    open: boolean;
    token: string;
    groups: Group[];
    onClose: () => void;
    onImported: () => Promise<void>;
}) {
    const { open, token, groups, onClose, onImported } = props;
    const { t } = useTranslation();

    const fileRef = useRef<HTMLInputElement>(null);

    const sortedGroups = useMemo(() => {
        return [...groups].sort((a, b) => a.name.localeCompare(b.name));
    }, [groups]);

    const [step, setStep] = useState<"input" | "preview">("input");
    const [groupId, setGroupId] = useState<number | null>(null);
    const [tagsText, setTagsText] = useState("history");
    const [historyText, setHistoryText] = useState("");

    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);

    useEffect(() => {
        if (!open) return;
        setStep("input");
        setGroupId(sortedGroups[0]?.id ?? null);
        setTagsText("history");
        setHistoryText("");
        setPreview(null);
        setLoading(false);
        setImporting(false);
    }, [open, sortedGroups]);

    if (!open) return null;

    const canPreview = groupId != null && historyText.trim().length > 0 && !loading && !importing;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={() => {
                    if (!loading && !importing) onClose();
                }}
            />
            <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-3xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
                <button
                    onClick={() => {
                        if (!loading && !importing) onClose();
                    }}
                    disabled={loading || importing}
                    className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground disabled:opacity-50"
                    aria-label={t("common.close")}
                    title={t("common.close")}
                >
                    <X className="w-4 h-4" />
                </button>

                <h2 className="text-lg font-semibold text-card-foreground pr-8">{t("historyImport.title")}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t("historyImport.subtitle")}</p>

                {step === "input" ? (
                    <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("historyImport.targetGroup")}</label>
                                <select
                                    value={groupId ?? ""}
                                    onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                                    disabled={loading || importing || sortedGroups.length === 0}
                                >
                                    {sortedGroups.length === 0 ? (
                                        <option value="">{t("historyImport.noGroups")}</option>
                                    ) : (
                                        sortedGroups.map((g) => (
                                            <option key={g.id} value={g.id}>
                                                {g.icon} {g.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                                {sortedGroups.length === 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">{t("historyImport.createGroupFirst")}</p>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("historyImport.tags")}</label>
                                <input
                                    value={tagsText}
                                    onChange={(e) => setTagsText(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                                    placeholder={t("historyImport.tagsPlaceholder")}
                                    disabled={loading || importing}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("historyImport.history")}</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".txt,.bash_history,.zsh_history"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            const reader = new FileReader();
                                            reader.onload = (evt) => {
                                                setHistoryText(String(evt.target?.result ?? ""));
                                            };
                                            reader.readAsText(f);
                                            e.target.value = "";
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="px-3 py-1.5 text-xs rounded-md border border-input hover:bg-surface-hover transition-colors disabled:opacity-50"
                                        onClick={() => fileRef.current?.click()}
                                        disabled={loading || importing}
                                    >
                                        {t("historyImport.importFile")}
                                    </button>
                                </div>
                            </div>
                            <textarea
                                value={historyText}
                                onChange={(e) => setHistoryText(e.target.value)}
                                className="mt-2 w-full min-h-[220px] px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue font-mono"
                                placeholder={"ex:\n: 1712345678:0;docker ps -a\ngit status\nnpm run dev"}
                                disabled={loading || importing}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                                {t("historyImport.hint")}
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!loading && !importing) onClose();
                                }}
                                disabled={loading || importing}
                                className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors disabled:opacity-50"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!canPreview) return;
                                    void (async () => {
                                        try {
                                            setLoading(true);
                                            const data = await apiRequest<PreviewResponse>("/import/history/preview", {
                                                method: "POST",
                                                token,
                                                json: {
                                                    group_id: groupId,
                                                    history: historyText,
                                                    tags: parseTags(tagsText),
                                                },
                                            });
                                            setPreview(data);
                                            setStep("preview");
                                        } catch (e: any) {
                                            toast.error(e?.message ?? t("historyImport.toastPreviewFailed"));
                                        } finally {
                                            setLoading(false);
                                        }
                                    })();
                                }}
                                disabled={!canPreview}
                                className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-40 transition-all font-medium inline-flex items-center gap-2"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {t("common.preview")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            <div className="p-3 rounded-lg border border-border bg-background">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("historyImport.statsLines")}</div>
                                <div className="text-sm font-semibold text-foreground mt-1">{preview?.total_lines ?? 0}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-border bg-background">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("historyImport.statsParsed")}</div>
                                <div className="text-sm font-semibold text-foreground mt-1">{preview?.parsed ?? 0}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-border bg-background">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("historyImport.statsNew")}</div>
                                <div className="text-sm font-semibold text-foreground mt-1">{preview?.created_candidates ?? 0}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-border bg-background">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("historyImport.statsDuplicates")}</div>
                                <div className="text-sm font-semibold text-foreground mt-1">{preview?.duplicate_candidates ?? 0}</div>
                            </div>
                            <div className="p-3 rounded-lg border border-border bg-background">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("historyImport.statsIgnored")}</div>
                                <div className="text-sm font-semibold text-foreground mt-1">{preview?.noise_candidates ?? 0}</div>
                            </div>
                        </div>

                        {preview?.truncated && (
                            <div className="text-xs text-muted-foreground">
                                {t("historyImport.previewTruncated")}
                            </div>
                        )}

                        <div className="border border-border rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-background border-b border-border text-xs font-medium text-muted-foreground">
                                {t("historyImport.detail")}
                            </div>
                            <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
                                {(preview?.items ?? []).map((it, idx) => (
                                    <div key={idx} className="px-3 py-2 flex items-start gap-3">
                                        <span
                                            className={
                                                it.status === "new"
                                                    ? "mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-border bg-surface-active text-foreground"
                                                    : it.status === "duplicate"
                                                        ? "mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-border bg-secondary text-muted-foreground"
                                                        : "mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-border bg-secondary text-muted-foreground"
                                            }
                                        >
                                            {it.status === "new" ? t("historyImport.statusNew") : it.status === "duplicate" ? t("historyImport.statusDuplicate") : t("historyImport.statusIgnored")}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-mono text-sm text-foreground break-words">{it.command}</div>
                                            {it.reason && (
                                                <div className="text-xs text-muted-foreground mt-1">{it.reason}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (loading || importing) return;
                                    setStep("input");
                                }}
                                disabled={loading || importing}
                                className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors disabled:opacity-50"
                            >
                                {t("common.back")}
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!loading && !importing) onClose();
                                    }}
                                    disabled={loading || importing}
                                    className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors disabled:opacity-50"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (importing || groupId == null || !preview) return;
                                        const toastId = toast.loading(t("common.importing"));
                                        void (async () => {
                                            try {
                                                setImporting(true);
                                                const res = await apiRequest<ImportResponse>("/import/history", {
                                                    method: "POST",
                                                    token,
                                                    json: {
                                                        group_id: groupId,
                                                        history: historyText,
                                                        tags: parseTags(tagsText),
                                                    },
                                                });
                                                toast.success(t("historyImport.toastImported", { count: res.created }), { id: toastId });
                                                await onImported();
                                                onClose();
                                            } catch (e: any) {
                                                toast.error(e?.message ?? t("historyImport.toastImportFailed"), { id: toastId });
                                            } finally {
                                                setImporting(false);
                                            }
                                        })();
                                    }}
                                    disabled={importing || groupId == null || (preview?.created_candidates ?? 0) === 0}
                                    className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-40 transition-all font-medium inline-flex items-center gap-2"
                                >
                                    {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {t("historyImport.importButton", { count: preview?.created_candidates ?? 0 })}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
