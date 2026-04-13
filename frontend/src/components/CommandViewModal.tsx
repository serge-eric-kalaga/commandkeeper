import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Command } from "@/hooks/useCommandVault";
import { useTranslation } from "react-i18next";

interface Props {
    open: boolean;
    command: Command | null;
    onClose: () => void;
    onCopy: (cmd: Command) => void;
}

export default function CommandViewModal({ open, command, onClose, onCopy }: Props) {
    const { t } = useTranslation();
    const [justCopied, setJustCopied] = useState(false);
    const copiedTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (open) setJustCopied(false);
    }, [open]);

    if (!open || !command) return null;

    const hasVars = /\{\{\w+\}\}/.test(command.command);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground"
                    aria-label={t("common.close")}
                    title={t("common.close")}
                >
                    <X className="w-4 h-4" />
                </button>

                <h2 className="text-lg font-semibold text-card-foreground pr-8">{command.title}</h2>

                {command.description && (
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{command.description}</p>
                )}

                <div className="mt-4">
                    <div className="text-xs font-medium text-muted-foreground mb-2">{t("commandView.command")}</div>
                    <pre className="bg-code-bg text-code-fg font-mono text-xs rounded-md p-4 overflow-x-auto whitespace-pre-wrap break-all">
                        {command.command}
                    </pre>
                </div>

                {command.tags.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-medium text-muted-foreground mb-2">{t("commandView.tags")}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {command.tags.map((tag) => (
                                <span key={tag} className="px-2 py-0.5 text-[11px] rounded-full bg-secondary text-secondary-foreground">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors">
                        {t("common.close")}
                    </button>
                    <button
                        onClick={() => {
                            onCopy(command);
                            if (hasVars) return;
                            setJustCopied(true);
                            if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
                            copiedTimeoutRef.current = window.setTimeout(() => setJustCopied(false), 1000);
                        }}
                        className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 transition-all font-medium inline-flex items-center gap-2"
                    >
                        {justCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {justCopied ? t("common.copied") : t("common.copy")}
                    </button>
                </div>
            </div>
        </div>
    );
}
