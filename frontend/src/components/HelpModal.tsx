import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function HelpModal({ open, onClose }: Props) {
    const { t } = useTranslation();
    if (!open) return null;

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

                <h2 className="text-lg font-semibold text-card-foreground pr-8">{t("help.title")}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t("help.subtitle")}</p>

                <div className="mt-6 space-y-6">
                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.shortcuts")}</h3>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <li>
                                <span className="font-mono text-foreground">Ctrl/Cmd + P</span> : {t("help.shortcutsCtrlP")}
                            </li>
                            <li>
                                <span className="font-mono text-foreground">Ctrl/Cmd + K</span> : {t("help.shortcutsCtrlK")}
                            </li>
                            <li>
                                <span className="font-mono text-foreground">Entrée</span> : {t("help.shortcutsEnter")}
                            </li>
                            <li>
                                <span className="font-mono text-foreground">Esc</span> : {t("help.shortcutsEsc")}
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.palette")}</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>{t("help.paletteDefault")}</p>
                            <p>{t("help.paletteRightNumber")}</p>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.advancedSearch")}</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>{t("help.operators")}</p>
                            <ul className="space-y-1">
                                <li>
                                    <span className="font-mono text-foreground">tag:docker</span> — {t("help.tag")}
                                </li>
                                <li>
                                    <span className="font-mono text-foreground">group:prod</span> — {t("help.group")}
                                </li>
                                <li>
                                    <span className="font-mono text-foreground">fav:true</span> — {t("help.fav")}
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.copyVariables")}</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>
                                {t("help.variables", { var: "{{VAR}}" })}
                            </p>
                            <ul className="space-y-1">
                                <li>{t("help.copyAsIs")}</li>
                                <li>{t("help.copyWithValues")}</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.organization")}</h3>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <li>{t("help.groupsLine")}</li>
                            <li>{t("help.tagsLine")}</li>
                            <li>{t("help.favoritesLine")}</li>
                            <li>{t("help.sortLine")}</li>
                            <li>{t("help.layoutLine")}</li>
                            <li>{t("help.viewLine")}</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.multiSelect")}</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>{t("help.multiSelectText")}</p>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.importExport")}</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>{t("help.importExportText")}</p>
                            <p>{t("help.importHistoryText")}</p>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">{t("help.dashboard")}</h3>
                        <div className="mt-2 text-sm text-muted-foreground">
                            {t("help.dashboardText")}
                        </div>
                    </section>
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 transition-all font-medium"
                    >
                        {t("common.close")}
                    </button>
                </div>
            </div>
        </div>
    );
}
