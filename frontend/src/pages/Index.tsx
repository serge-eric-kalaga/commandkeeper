import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Plus, FileCode, Loader2, LayoutGrid, LayoutList, ArrowDownUp, ArrowUp, X, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { useCommandVault, Command, Group, VaultData } from "@/hooks/useCommandVault";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/apiClient";
import AppSidebar from "@/components/AppSidebar";
import CommandCard from "@/components/CommandCard";
import GroupModal from "@/components/GroupModal";
import CommandModal from "@/components/CommandModal";
import CommandViewModal from "@/components/CommandViewModal";
import CommandPalette from "@/components/CommandPalette";
import HelpModal from "@/components/HelpModal";
import HistoryImportModal from "@/components/HistoryImportModal";
import ExportModal from "@/components/ExportModal";
import VariableModal from "@/components/VariableModal";
import DeleteModal from "@/components/DeleteModal";
import BulkMoveModal from "@/components/BulkMoveModal";
import { Skeleton } from "@/components/ui/skeleton";

function parseAdvancedSearch(input: string): {
  text: string;
  tags: string[];
  groupName?: string;
  isFavorite?: boolean;
} {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const tags: string[] = [];
  let groupName: string | undefined;
  let isFavorite: boolean | undefined;
  const rest: string[] = [];

  for (const p of parts) {
    const idx = p.indexOf(":");
    if (idx <= 0) {
      rest.push(p);
      continue;
    }

    const key = p.slice(0, idx).toLowerCase();
    const rawValue = p.slice(idx + 1);
    if (!rawValue) continue;

    if (key === "tag") {
      const normalized = rawValue
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      tags.push(...normalized);
      continue;
    }

    if (key === "group") {
      groupName = rawValue.trim();
      continue;
    }

    if (key === "fav" || key === "favorite") {
      const v = rawValue.trim().toLowerCase();
      if (v === "true" || v === "1" || v === "yes") isFavorite = true;
      if (v === "false" || v === "0" || v === "no") isFavorite = false;
      continue;
    }

    rest.push(p);
  }

  // de-dup tags
  const uniqTags = Array.from(new Set(tags));
  return { text: rest.join(" "), tags: uniqTags, groupName, isFavorite };
}

function extractHighlightTerms(input: string): string[] {
  const parts = input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[\s.,;:()\[\]{}<>\"']+|[\s.,;:()\[\]{}<>\"']+$/g, ""))
    .filter(Boolean);

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (p.length < 2) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    uniq.push(p);
    if (uniq.length >= 10) break;
  }
  return uniq;
}

function VaultPage({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { t } = useTranslation();
  const vault = useCommandVault(token);
  const theme = useTheme();

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadMoreCommands = vault.loadMoreCommands;
  const setCommandsView = vault.setCommandsView;

  const [activeView, setActiveView] = useState("all");
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tagsOverflow, setTagsOverflow] = useState(false);
  const tagsContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<"vertical" | "horizontal">(() => {
    if (typeof window === "undefined") return "vertical";
    const stored = localStorage.getItem("command-vault-layout");
    if (stored === "horizontal" || stored === "vertical") return stored;
    return "vertical";
  });
  const [sortMode, setSortMode] = useState<"recent" | "mostCopied">("recent");

  type DashboardStats = {
    commands: number;
    groups: number;
    tags: number;
    copies: number;
    from_date: string;
    to_date: string;
  };

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultFromIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dashFrom, setDashFrom] = useState(defaultFromIso);
  const [dashTo, setDashTo] = useState(todayIso);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("command-vault-layout", layout);
  }, [layout]);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Command[] | null>(null);

  const highlightTerms = useMemo(() => {
    const parsed = parseAdvancedSearch(search);
    return extractHighlightTerms(parsed.text);
  }, [search]);

  // Modals
  const [groupModal, setGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [cmdModal, setCmdModal] = useState(false);
  const [editCmd, setEditCmd] = useState<Command | null>(null);
  const [viewCmd, setViewCmd] = useState<Command | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyImportOpen, setHistoryImportOpen] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exportSelection, setExportSelection] = useState<Command[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "command" | "group"; id: number; title: string } | null>(null);
  const [varModal, setVarModal] = useState<Command | null>(null);

  // Bulk selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkFavoriting, setBulkFavoriting] = useState(false);

  const viewToOptions = useCallback((view: string): { groupId?: number; favoritesOnly?: boolean } => {
    if (view === "favorites") return { favoritesOnly: true };
    if (view.startsWith("group:")) return { groupId: Number(view.slice(6)) };
    return {};
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("vault-search")?.focus();
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setHelpOpen(false);
        setHistoryImportOpen(false);
        setGroupModal(false);
        setCmdModal(false);
        setViewCmd(null);
        setDeleteTarget(null);
        setVarModal(null);
        setBulkMoveOpen(false);
        setBulkDeleteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Keep selection sane: if view/search filters change, clear selection.
  useEffect(() => {
    if (!selectionMode) return;
    setSelectedIds(new Set());
  }, [activeView, search, tagFilters.join("|"), selectionMode]);

  const bulkPatchCommands = useCallback(async (ids: number[], patch: Record<string, unknown>) => {
    await Promise.all(
      ids.map((id) => apiRequest(`/commands/${id}`, { method: "PATCH", token, json: patch }))
    );
  }, [token]);

  const bulkDeleteCommands = useCallback(async (ids: number[]) => {
    await Promise.all(
      ids.map((id) => apiRequest(`/commands/${id}`, { method: "DELETE", token }))
    );
  }, [token]);

  // Base commands set for the current view/search (without tag filters).
  // This is used to keep the tag list stable when selecting multiple tags.
  const baseCommands = useMemo(() => {
    const isServerSearch = search.trim().length > 0;
    const cmds = isServerSearch ? [...(searchResults ?? [])] : [...vault.data.commands];
    // vault.data.commands is already loaded for the current view.
    return cmds;
  }, [vault.data.commands, activeView, search, searchResults]);

  const selectedCount = selectedIds.size;
  const selectedCommands = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const byId = new Map<number, Command>();
    for (const c of baseCommands) byId.set(c.id, c);
    return Array.from(selectedIds).map((id) => byId.get(id)).filter(Boolean) as Command[];
  }, [baseCommands, selectedIds]);

  const setSelected = useCallback((id: number, isSelected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Filtered commands (applies tag filters + sorting)
  const filteredCommands = useMemo(() => {
    let cmds = [...baseCommands];

    if (tagFilters.length > 0) {
      cmds = cmds.filter((c) => tagFilters.some((t) => c.tags.includes(t)));
    }

    if (sortMode === "mostCopied") {
      cmds.sort((a, b) => {
        if (b.copyCount !== a.copyCount) return b.copyCount - a.copyCount;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    }

    return cmds;
  }, [baseCommands, tagFilters, sortMode]);

  const toggleTagFilter = useCallback((tag: string) => {
    setTagFilters((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  // Server-side search
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const parsed = parseAdvancedSearch(q);

    // If the user is still typing an operator (e.g. "tag:"), avoid spamming the API.
    if (!parsed.text && parsed.tags.length === 0 && parsed.isFavorite === undefined && !parsed.groupName) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();

    const defaultGroupId = activeView.startsWith("group:") ? Number(activeView.slice(6)) : undefined;
    const defaultFavorite = activeView === "favorites" ? true : undefined;

    let groupId = defaultGroupId;
    if (parsed.groupName) {
      const match = vault.data.groups.find((g) => g.name.toLowerCase() === parsed.groupName!.toLowerCase());
      if (!match) {
        setSearchLoading(false);
        setSearchResults([]);
        return;
      }
      groupId = match.id;
    }

    const isFavorite = parsed.isFavorite ?? defaultFavorite;
    const tags = parsed.tags;

    setSearchLoading(true);
    setSearchResults(null);

    const timeoutId = window.setTimeout(() => {
      void vault
        .searchCommands(parsed.text, { groupId, limit: 200, tags, isFavorite, signal: controller.signal })
        .then((items) => {
          if (cancelled) return;
          setSearchResults(items);
        })
        .catch((err) => {
          if (cancelled) return;
          if ((err as any)?.name === "AbortError") return;
          setSearchResults([]);
        })
        .finally(() => {
          if (cancelled) return;
          setSearchLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [search, activeView, vault.searchCommands, vault.data.groups]);

  // Current group
  const currentGroup = activeView.startsWith("group:")
    ? vault.data.groups.find((g) => g.id === Number(activeView.slice(6)))
    : null;

  const viewTitle = activeView === "dashboard"
    ? t("vault.view.dashboard")
    : activeView === "all"
      ? t("vault.view.all")
      : activeView === "favorites"
        ? t("vault.view.favorites")
        : currentGroup?.name ?? t("vault.view.commands");

  useEffect(() => {
    if (activeView !== "dashboard") return;
    let cancelled = false;
    const controller = new AbortController();

    setDashLoading(true);
    void apiRequest<DashboardStats>("/stats/dashboard", {
      token,
      signal: controller.signal,
      query: {
        from_date: dashFrom,
        to_date: dashTo,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setDashStats(res);
      })
      .catch(() => {
        if (cancelled) return;
        setDashStats(null);
      })
      .finally(() => {
        if (cancelled) return;
        setDashLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeView, dashFrom, dashTo, token]);

  const currentViewForExport = useMemo(() => {
    const parsed = parseAdvancedSearch(search);
    const base = viewToOptions(activeView);

    let groupId = base.groupId;
    if (parsed.groupName) {
      const match = vault.data.groups.find((g) => g.name.toLowerCase() === parsed.groupName!.toLowerCase());
      groupId = match ? match.id : -1;
    }

    const favoritesOnly = parsed.isFavorite ?? base.favoritesOnly;
    const tags = Array.from(new Set([...(tagFilters ?? []), ...(parsed.tags ?? [])]));
    const q = parsed.text.trim() ? parsed.text.trim() : undefined;

    return { groupId, favoritesOnly, tags, q };
  }, [activeView, search, tagFilters, viewToOptions, vault.data.groups]);

  // All tags for filter (from baseCommands so tags don't disappear when filtering)
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    baseCommands.forEach((c) => c.tags.forEach((t) => tags.add(t)));
    return [...tags].sort();
  }, [baseCommands]);

  useEffect(() => {
    const el = tagsContainerRef.current;
    if (!el) return;

    const computeOverflow = () => {
      // Keep previous value while expanded so the collapse button stays visible.
      if (tagsExpanded) return;
      setTagsOverflow(el.scrollHeight > el.clientHeight);
    };

    requestAnimationFrame(computeOverflow);

    const ro = new ResizeObserver(() => computeOverflow());
    ro.observe(el);
    return () => ro.disconnect();
  }, [allTags, tagsExpanded]);

  // Copy handler
  const handleCopy = useCallback((cmd: Command) => {
    const hasVars = /\{\{\w+\}\}/.test(cmd.command);
    if (hasVars) {
      setVarModal(cmd);
    } else {
      navigator.clipboard.writeText(cmd.command);
      void vault.incrementCopy(cmd.id).catch(() => {
        // ignore copy count sync errors
      });
    }
  }, [vault]);

  // Infinite scroll: load more when sentinel enters viewport.
  useEffect(() => {
    if (search.trim().length > 0) return;
    const el = loadMoreRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreCommands().catch(() => {
          // ignore load-more errors (user can retry by scrolling)
        });
      },
      { root: null, rootMargin: "400px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [loadMoreCommands, search]);

  // Import handler
  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as VaultData;
        if (!imported.groups || !imported.commands) throw new Error();
        const toastId = toast.loading(t("vault.importingToast"));
        void vault
          .importData(imported)
          .then(({ groups, commands }) => {
            toast.success(t("vault.importSuccess", { groups, commands }), { id: toastId });

            // Ensure the newly imported data is visible immediately.
            setSearch("");
            setSearchResults(null);
            setSearchLoading(false);
            setTagFilters([]);
            setActiveView("all");
          })
          .catch((err) => {
            toast.error((err as any)?.message ?? t("vault.importFailed"), { id: toastId });
          });
      } catch {
        toast.error(t("vault.invalidJson"));
      }
    };
    reader.readAsText(file);
  }, [t, vault]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        groups={vault.data.groups}
        stats={vault.stats}
        loading={vault.loading && vault.data.groups.length === 0}
        importing={vault.importing}
        activeView={activeView}
        onViewChange={(v) => {
          setActiveView(v);
          setSearch("");
          setSearchResults(null);
          setSearchLoading(false);
          setTagFilters([]);
          setTagsExpanded(false);
          void setCommandsView(viewToOptions(v)).catch(() => {
            // ignore
          });
        }}
        onNewGroup={() => { setEditGroup(null); setGroupModal(true); }}
        onExport={() => {
          setExportSelection(null);
          setExportModal(true);
        }}
        onImport={handleImport}
        onImportHistory={() => {
          if (vault.data.groups.length === 0) {
            toast.info(t("vault.createGroupFirst"));
            return;
          }
          setHistoryImportOpen(true);
        }}
        onLogout={onLogout}
        dark={theme.dark}
        onToggleTheme={theme.toggle}
        onEditGroup={(g) => { setEditGroup(g); setGroupModal(true); }}
        onDeleteGroup={(id) => {
          const g = vault.data.groups.find((gr) => gr.id === id);
          if (g) setDeleteTarget({ type: "group", id, title: g.name });
        }}
      />

      {/* Main area */}
      <main className="flex-1 min-w-0">
        <div className="w-full max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-8">
          {vault.loading && vault.data.groups.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("common.loading")}
            </div>
          )}

          {vault.importing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("common.importing")}
            </div>
          )}

          {/* Sticky Header + Search */}
          <div className="sticky top-0 z-40 -mx-3 md:-mx-6 px-3 md:px-6 py-4 bg-background/90 backdrop-blur-sm border-b border-border">
            {/* Header */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  {currentGroup && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: currentGroup.color }} />}
                  {currentGroup && <span className="text-2xl">{currentGroup.icon}</span>}
                  <h1 className="text-xl font-semibold text-foreground" style={currentGroup ? { color: currentGroup.color } : undefined}>{viewTitle}</h1>
                </div>
                {currentGroup && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditGroup(currentGroup); setGroupModal(true); }} className="px-3 py-1.5 text-xs rounded-md hover:bg-surface-hover text-muted-foreground transition-colors">{t("common.edit")}</button>
                    <button onClick={() => setDeleteTarget({ type: "group", id: currentGroup.id, title: currentGroup.name })} className="px-3 py-1.5 text-xs rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">{t("common.delete")}</button>
                  </div>
                )}
              </div>
              {currentGroup?.description && (
                <p className="text-sm text-muted-foreground">{currentGroup.description}</p>
              )}
            </div>

            {/* Search & Actions */}
            {activeView !== "dashboard" ? (
              <div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    {searchLoading && (
                      <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                    )}
                    {search.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setSearchResults(null);
                          setSearchLoading(false);
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                        aria-label={t("vault.search.clear")}
                        title={t("vault.search.clear")}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <input
                      id="vault-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("vault.search.placeholder")}
                      title={t("vault.search.advancedTitle")}
                      ref={searchInputRef}
                      className="w-full pl-9 pr-9 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue placeholder:text-muted-foreground"
                    />
                  </div>

                  <button
                    onClick={() => setLayout((prev) => (prev === "vertical" ? "horizontal" : "vertical"))}
                    disabled={vault.loading}
                    title={layout === "vertical" ? t("vault.layout.switchToHorizontal") : t("vault.layout.switchToVertical")}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition-colors"
                  >
                    {layout === "vertical" ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                    <span className="hidden sm:inline">{layout === "vertical" ? t("vault.layout.horizontal") : t("vault.layout.vertical")}</span>
                  </button>

                  <button
                    onClick={() => setSortMode((prev) => (prev === "recent" ? "mostCopied" : "recent"))}
                    disabled={vault.loading}
                    title={sortMode === "mostCopied" ? t("vault.sort.titleMostCopied") : t("vault.sort.titleRecent")}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background transition-colors disabled:opacity-50 ${sortMode === "mostCopied" ? "text-foreground bg-surface-active" : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"}`}
                  >
                    <ArrowDownUp className="w-4 h-4" />
                    <span className="hidden sm:inline">{sortMode === "mostCopied" ? t("vault.sort.mostCopied") : t("vault.sort.recent")}</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectionMode((v) => {
                        const next = !v;
                        if (!next) setSelectedIds(new Set());
                        return next;
                      });
                    }}
                    disabled={vault.loading}
                    title={selectionMode ? t("vault.selection.exit") : t("vault.selection.selectMultiple")}
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background transition-colors disabled:opacity-50 ${selectionMode ? "text-foreground bg-surface-active" : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"}`}
                  >
                    <ListChecks className="w-4 h-4" />
                    <span className="hidden sm:inline">{selectionMode ? t("vault.selection.selecting") : t("vault.selection.select")}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (vault.data.groups.length === 0) {
                        toast.info(t("vault.createGroupFirst"));
                        setEditGroup(null);
                        setGroupModal(true);
                        return;
                      }
                      setEditCmd(null);
                      setCmdModal(true);
                    }}
                    disabled={vault.loading}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-50 transition-all font-medium whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> {t("vault.addCommand")}
                  </button>

                  <button
                    onClick={() => setHelpOpen(true)}
                    disabled={vault.loading}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition-colors"
                    title={t("help.title")}
                  >
                    {t("help.title")}
                  </button>
                </div>

                <div className="mt-1 text-[11px] text-muted-foreground pl-9">
                  {t("vault.tips")} <span className="font-mono">tag:docker</span> <span className="font-mono">group:prod</span> <span className="font-mono">fav:true</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                <div className="flex-1">
                  <div className="text-xs font-medium text-muted-foreground mb-2">{t("vault.dashboard.copiesDateRange")}</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">{t("vault.dashboard.from")}</label>
                      <input
                        type="date"
                        value={dashFrom}
                        onChange={(e) => setDashFrom(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">{t("vault.dashboard.to")}</label>
                      <input
                        type="date"
                        value={dashTo}
                        onChange={(e) => setDashTo(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {dashLoading ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("vault.dashboard.loading")}</span>
                  ) : dashStats ? (
                    <Trans
                      i18nKey="vault.dashboard.showingCopies"
                      values={{ from: dashStats.from_date, to: dashStats.to_date }}
                      components={{
                        from: <span className="font-medium text-foreground" />,
                        to: <span className="font-medium text-foreground" />,
                      }}
                    />
                  ) : (
                    <span>{t("vault.dashboard.unableToLoad")}</span>
                  )}
                </div>

                <div className="flex items-end justify-end">
                  <button
                    onClick={() => setHelpOpen(true)}
                    className="inline-flex items-center justify-center px-3 py-2 text-sm rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    title={t("help.title")}
                  >
                    {t("help.title")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tag filter */}
          {activeView !== "dashboard" && allTags.length > 0 && (
            <div className="mb-5 mt-3">
              {tagFilters.length > 0 && (
                <div className="flex items-center justify-end mb-2">
                  <button
                    onClick={() => setTagFilters([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("vault.tagFilter.clear")}
                  </button>
                </div>
              )}
              <div
                ref={tagsContainerRef}
                className={`flex flex-wrap gap-1.5 ${tagsExpanded ? "" : "max-h-[56px] overflow-hidden"}`}
              >
                {allTags.map((tag) => {
                  const selected = tagFilters.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTagFilter(tag)}
                      className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${selected
                        ? "bg-accent-blue text-accent-blue-foreground font-medium"
                        : "bg-secondary text-secondary-foreground hover:bg-surface-hover"}`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              {tagsOverflow && (
                <button
                  onClick={() => setTagsExpanded((v) => !v)}
                  className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tagsExpanded ? t("vault.tagFilter.showLess") : t("vault.tagFilter.showAll")}
                </button>
              )}
            </div>
          )}

          {/* Command cards */}
          {activeView === "dashboard" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <div className="border border-border rounded-lg bg-card p-4">
                <div className="text-xs text-muted-foreground">{t("vault.dashboard.commands")}</div>
                <div className="text-2xl font-semibold text-foreground mt-1">{dashStats?.commands ?? "—"}</div>
              </div>
              <div className="border border-border rounded-lg bg-card p-4">
                <div className="text-xs text-muted-foreground">{t("vault.dashboard.groups")}</div>
                <div className="text-2xl font-semibold text-foreground mt-1">{dashStats?.groups ?? "—"}</div>
              </div>
              <div className="border border-border rounded-lg bg-card p-4">
                <div className="text-xs text-muted-foreground">{t("vault.dashboard.tags")}</div>
                <div className="text-2xl font-semibold text-foreground mt-1">{dashStats?.tags ?? "—"}</div>
              </div>
              <div className="border border-border rounded-lg bg-card p-4">
                <div className="text-xs text-muted-foreground">{t("vault.dashboard.copiesRange")}</div>
                <div className="text-2xl font-semibold text-foreground mt-1">{dashStats?.copies ?? "—"}</div>
              </div>
            </div>
          ) : ((search.trim().length === 0 && vault.commandsLoading && vault.data.commands.length === 0) || (search.trim().length > 0 && searchLoading && searchResults === null)) ? (
            <div className={`grid gap-3 ${layout === "horizontal" ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border border-border rounded-lg bg-card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-4 rounded" />
                  </div>
                  <Skeleton className="h-16 w-full" />
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <Skeleton className="h-3 w-24" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-20" />
                      <Skeleton className="h-7 w-20" />
                      <Skeleton className="h-7 w-20" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCommands.length > 0 ? (
            <div className={`grid gap-3 ${layout === "horizontal" ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              {filteredCommands.map((cmd) => (
                <CommandCard
                  key={cmd.id}
                  cmd={cmd}
                  groupColor={vault.data.groups.find(g => g.id === cmd.groupId)?.color}
                  onCopy={handleCopy}
                  onView={(c) => setViewCmd(c)}
                  onEdit={(c) => { setEditCmd(c); setCmdModal(true); }}
                  onDelete={(c) => setDeleteTarget({ type: "command", id: c.id, title: c.title })}
                  onToggleFavorite={(id) => {
                    void vault.toggleFavorite(id).catch((e: any) => {
                      toast.error(e?.message ?? t("vault.updateFavoriteFailed"));
                    });
                  }}
                  onTagClick={toggleTagFilter}
                  highlightTerms={search.trim().length > 0 ? highlightTerms : undefined}
                  selectable={selectionMode}
                  selected={selectedIds.has(cmd.id)}
                  onSelectChange={(v) => setSelected(cmd.id, v)}
                />
              ))}

              {/* Infinite scroll sentinel */}
              {search.trim().length === 0 && (
                <>
                  {vault.commandsHasMore && (
                    <div
                      ref={loadMoreRef}
                      className={`${layout === "horizontal" ? "sm:col-span-2" : ""} h-1 w-full`}
                      aria-hidden="true"
                    />
                  )}
                  {vault.commandsLoadingMore && (
                    <div className={`${layout === "horizontal" ? "sm:col-span-2" : ""} flex items-center justify-center py-4 text-sm text-muted-foreground`}>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {t("vault.loadingMore")}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileCode className="w-12 h-12 text-muted-foreground/40 mb-4" />
              {search ? (
                <p className="text-sm text-muted-foreground">{t("vault.noResults", { query: search })}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t("vault.noCommandsTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("vault.noCommandsSubtitle")}</p>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center justify-center w-10 h-10 rounded-full border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        aria-label={t("vault.scrollTop")}
        title={t("vault.scrollTop")}
      >
        <ArrowUp className="w-4 h-4" />
      </button>

      {/* Modals */}
      <GroupModal
        open={groupModal}
        group={editGroup}
        onClose={() => setGroupModal(false)}
        onSave={async (data) => {
          try {
            if (editGroup) {
              await vault.updateGroup(editGroup.id, data);
              toast.success(t("vault.toast.groupUpdated"));
            } else {
              await vault.addGroup(data);
              toast.success(t("vault.toast.groupCreated"));
            }
          } catch (e: any) {
            toast.error(e?.message ?? t("vault.toast.saveGroupFailed"));
            throw e;
          }
        }}
      />

      {/* Bulk action bar */}
      {selectionMode && selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(42rem,calc(100%-1.5rem))]">
          <div className="bg-card border border-border rounded-xl shadow-lg px-3 py-2 flex items-center justify-between gap-3">
            <div className="text-sm text-foreground">
              {t("vault.selected", { count: selectedCount })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkMoveOpen(true)}
                disabled={vault.data.groups.length === 0 || bulkDeleting || bulkFavoriting}
                className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                {t("common.move")}
              </button>
              <button
                onClick={() => {
                  setExportSelection(selectedCommands);
                  setExportModal(true);
                }}
                disabled={bulkDeleting || bulkFavoriting}
                className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                {t("common.exportSelection")}
              </button>
              <button
                onClick={() => {
                  if (bulkFavoriting) return;
                  const ids = Array.from(selectedIds);
                  const toastId = toast.loading(t("vault.updatingFavorites"));
                  void (async () => {
                    try {
                      setBulkFavoriting(true);
                      await bulkPatchCommands(ids, { is_favorite: true });
                      await vault.reload();
                      toast.success(t("common.updated"), { id: toastId });
                      setSelectedIds(new Set());
                    } catch (e: any) {
                      toast.error(e?.message ?? t("vault.toast.failed"), { id: toastId });
                    } finally {
                      setBulkFavoriting(false);
                    }
                  })();
                }}
                disabled={bulkDeleting}
                className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                {t("common.favorite")}
              </button>
              <button
                onClick={() => setBulkDeleteOpen(true)}
                className="px-3 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-colors disabled:opacity-60"
                disabled={bulkFavoriting}
              >
                {t("common.delete")}
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectionMode(false);
                }}
                disabled={bulkDeleting || bulkFavoriting}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandModal
        open={cmdModal}
        command={editCmd}
        groups={vault.data.groups}
        defaultGroupId={currentGroup?.id}
        onClose={() => setCmdModal(false)}
        onSave={async (data) => {
          try {
            if (editCmd) {
              await vault.updateCommand(editCmd.id, data);
              toast.success(t("vault.toast.commandSaved"));
            } else {
              await vault.addCommand({ ...data, copyCount: 0 });
              toast.success(t("vault.toast.commandSaved"));
            }
          } catch (e: any) {
            toast.error(e?.message ?? t("vault.toast.saveCommandFailed"));
            throw e;
          }
        }}
      />

      <CommandViewModal
        open={!!viewCmd}
        command={viewCmd}
        onClose={() => setViewCmd(null)}
        onCopy={handleCopy}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        groups={vault.data.groups}
        search={vault.searchCommands}
        getTopCopied={vault.getTopCopied}
        onPick={handleCopy}
        parseAdvancedSearch={parseAdvancedSearch}
      />

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      <HistoryImportModal
        open={historyImportOpen}
        token={token}
        groups={vault.data.groups}
        onClose={() => setHistoryImportOpen(false)}
        onImported={async () => {
          await vault.reload();
        }}
      />

      <VariableModal
        open={!!varModal}
        command={varModal?.command ?? ""}
        defaults={varModal?.defaultVariables ?? {}}
        onClose={() => setVarModal(null)}
        onCopyWithValues={(result) => {
          navigator.clipboard.writeText(result);
          if (varModal) {
            void vault.incrementCopy(varModal.id).catch(() => {
              // ignore
            });
          }
          window.setTimeout(() => setVarModal(null), 700);
        }}
        onCopyRaw={() => {
          if (varModal) {
            navigator.clipboard.writeText(varModal.command);
            void vault.incrementCopy(varModal.id).catch(() => {
              // ignore
            });
          }
          window.setTimeout(() => setVarModal(null), 700);
        }}
      />

      <DeleteModal
        open={!!deleteTarget}
        title={deleteTarget?.title ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          try {
            if (deleteTarget?.type === "command") {
              await vault.deleteCommand(deleteTarget.id);
            } else if (deleteTarget?.type === "group") {
              await vault.deleteGroup(deleteTarget.id);
              if (activeView === `group:${deleteTarget.id}`) setActiveView("all");
            }
            toast.success(t("common.deleted"));
          } catch (e: any) {
            toast.error(e?.message ?? t("vault.deleteFailed"));
            throw e;
          }
        }}
      />

      <DeleteModal
        open={bulkDeleteOpen}
        title={t("vault.commandsCount", { count: selectedCount })}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          if (bulkDeleting) return;
          const ids = Array.from(selectedIds);
          const toastId = toast.loading(t("vault.deleting"));
          try {
            setBulkDeleting(true);
            await bulkDeleteCommands(ids);
            await vault.reload();
            toast.success(t("common.deleted"), { id: toastId });
            setSelectedIds(new Set());
          } catch (e: any) {
            toast.error(e?.message ?? t("vault.deleteFailed"), { id: toastId });
            throw e;
          } finally {
            setBulkDeleting(false);
          }
        }}
      />

      <ExportModal
        open={exportModal}
        onClose={() => { setExportModal(false); setExportSelection(null); }}
        token={token}
        groups={vault.data.groups}
        currentView={currentViewForExport}
        selectionCommands={exportSelection ?? undefined}
      />

      <BulkMoveModal
        open={bulkMoveOpen}
        groups={vault.data.groups}
        count={selectedCount}
        onClose={() => setBulkMoveOpen(false)}
        onConfirm={async (groupId) => {
          const ids = Array.from(selectedIds);
          const toastId = toast.loading(t("vault.moving"));
          try {
            await bulkPatchCommands(ids, { group_id: groupId });
            await vault.reload();
            toast.success(t("common.moved"), { id: toastId });
            setSelectedIds(new Set());
          } catch (e: any) {
            toast.error(e?.message ?? t("vault.moveFailed"), { id: toastId });
            throw e;
          }
        }}
      />
    </div>
  );
}

const Index = () => {
  const { t } = useTranslation();
  const auth = useAuth();

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  const canSubmitPasswordChange = oldPassword.trim().length > 0 && newPassword.trim().length >= 6 && !changeLoading;

  const handleLogin = useCallback(async () => {
    try {
      setLoginLoading(true);
      const res = await auth.login(loginUsername, loginPassword);
      if (res.must_change_password) {
        toast.info(t("auth.mustChangePasswordToast"));
        setOldPassword(loginPassword);
        setNewPassword("");
      } else {
        toast.success(t("auth.signedInToast"));
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("auth.signInFailedToast"));
    } finally {
      setLoginLoading(false);
    }
  }, [auth, loginUsername, loginPassword, t]);

  const handleChangePassword = useCallback(async () => {
    if (newPassword.trim().length < 6) {
      toast.error(t("auth.newPasswordMinToast", { count: 6 }));
      return;
    }
    try {
      setChangeLoading(true);
      await auth.changePassword(oldPassword, newPassword);
      toast.success(t("auth.passwordUpdatedToast"));
      setOldPassword("");
      setNewPassword("");
    } catch (e: any) {
      toast.error(e?.message ?? t("auth.passwordUpdateFailedToast"));
    } finally {
      setChangeLoading(false);
    }
  }, [auth, oldPassword, newPassword, t]);

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 shadow-lg">
          <div className="flex flex-col items-center text-center mb-6">
            <img src="/icon.png" alt="Command Keeper" className="h-12 w-auto" />
            <h1 className="text-xl font-semibold text-foreground mt-4">{t("auth.welcomeTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("auth.welcomeSubtitle")}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("auth.username")}</label>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("auth.password")}</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <button
              disabled={loginLoading}
              onClick={handleLogin}
              className="w-full px-4 py-2.5 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-60 transition-all font-medium"
            >
              {loginLoading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (auth.mustChangePassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 shadow-lg">
          <div className="flex flex-col items-center text-center mb-6">
            <img src="/icon.png" alt="Command Keeper" className="h-12 w-auto" />
            <h1 className="text-xl font-semibold text-foreground mt-4">{t("auth.changePasswordTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("auth.changePasswordSubtitle")}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("auth.currentPassword")}</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("auth.newPassword")}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{t("auth.minCharsHint", { count: 6 })}</p>
            </div>
            <button
              disabled={!canSubmitPasswordChange}
              onClick={handleChangePassword}
              className="w-full px-4 py-2.5 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-60 transition-all font-medium"
            >
              {changeLoading ? t("auth.updating") : t("auth.update")}
            </button>

            <button
              onClick={() => auth.logout()}
              className="w-full px-4 py-2.5 text-sm rounded-md border border-input hover:bg-surface-hover transition-colors"
            >
              {t("auth.signOut")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VaultPage
      token={auth.token!}
      onLogout={() => {
        auth.logout();
        toast.success(t("auth.signedOutToast"));
      }}
    />
  );
};

export default Index;
