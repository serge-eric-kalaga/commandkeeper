import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Plus, FileCode, Loader2, LayoutGrid, LayoutList, ArrowDownUp, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { useCommandVault, Command, Group, VaultData } from "@/hooks/useCommandVault";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import AppSidebar from "@/components/AppSidebar";
import CommandCard from "@/components/CommandCard";
import GroupModal from "@/components/GroupModal";
import CommandModal from "@/components/CommandModal";
import VariableModal from "@/components/VariableModal";
import DeleteModal from "@/components/DeleteModal";
import { Skeleton } from "@/components/ui/skeleton";

function VaultPage({ token, onLogout }: { token: string; onLogout: () => void }) {
  const vault = useCommandVault(token);
  const theme = useTheme();

  const loadMoreCommands = vault.loadMoreCommands;
  const setCommandsView = vault.setCommandsView;

  const [activeView, setActiveView] = useState("all");
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tagsOverflow, setTagsOverflow] = useState(false);
  const tagsContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<"vertical" | "horizontal">("vertical");
  const [sortMode, setSortMode] = useState<"recent" | "mostCopied">("recent");

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Command[] | null>(null);

  // Modals
  const [groupModal, setGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [cmdModal, setCmdModal] = useState(false);
  const [editCmd, setEditCmd] = useState<Command | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "command" | "group"; id: number; title: string } | null>(null);
  const [varModal, setVarModal] = useState<Command | null>(null);

  const viewToOptions = useCallback((view: string): { groupId?: number; favoritesOnly?: boolean } => {
    if (view === "favorites") return { favoritesOnly: true };
    if (view.startsWith("group:")) return { groupId: Number(view.slice(6)) };
    return {};
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("vault-search")?.focus();
      }
      if (e.key === "Escape") {
        setGroupModal(false);
        setCmdModal(false);
        setDeleteTarget(null);
        setVarModal(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Base commands set for the current view/search (without tag filters).
  // This is used to keep the tag list stable when selecting multiple tags.
  const baseCommands = useMemo(() => {
    const isServerSearch = search.trim().length > 0;
    const cmds = isServerSearch ? [...(searchResults ?? [])] : [...vault.data.commands];
    // vault.data.commands is already loaded for the current view.
    return cmds;
  }, [vault.data.commands, activeView, search, searchResults]);

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
    const groupId = activeView.startsWith("group:") ? Number(activeView.slice(6)) : undefined;

    setSearchLoading(true);
    setSearchResults(null);

    const t = window.setTimeout(() => {
      void vault
        .searchCommands(q, { groupId, limit: 200 })
        .then((items) => {
          if (cancelled) return;
          setSearchResults(items);
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResults([]);
        })
        .finally(() => {
          if (cancelled) return;
          setSearchLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [search, activeView, vault.searchCommands]);

  // Current group
  const currentGroup = activeView.startsWith("group:")
    ? vault.data.groups.find((g) => g.id === Number(activeView.slice(6)))
    : null;

  const viewTitle = activeView === "all" ? "All Commands" : activeView === "favorites" ? "Favorites" : currentGroup?.name ?? "Commands";

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
        const toastId = toast.loading("Importing...");
        void vault
          .importData(imported)
          .then(({ groups, commands }) => {
            toast.success(`Imported successfully (${groups} groups, ${commands} commands)`, { id: toastId });

            // Ensure the newly imported data is visible immediately.
            setSearch("");
            setSearchResults(null);
            setSearchLoading(false);
            setTagFilters([]);
            setActiveView("all");
          })
          .catch((err) => {
            toast.error((err as any)?.message ?? "Import failed", { id: toastId });
          });
      } catch {
        toast.error("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }, [vault]);

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
        onExport={vault.exportData}
        onImport={handleImport}
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
              Loading...
            </div>
          )}

          {vault.importing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing...
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
                    <button onClick={() => { setEditGroup(currentGroup); setGroupModal(true); }} className="px-3 py-1.5 text-xs rounded-md hover:bg-surface-hover text-muted-foreground transition-colors">Edit</button>
                    <button onClick={() => setDeleteTarget({ type: "group", id: currentGroup.id, title: currentGroup.name })} className="px-3 py-1.5 text-xs rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">Delete</button>
                  </div>
                )}
              </div>
              {currentGroup?.description && (
                <p className="text-sm text-muted-foreground">{currentGroup.description}</p>
              )}
            </div>

            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
                <input
                  id="vault-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search commands... (Ctrl+K)"
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue placeholder:text-muted-foreground"
                />
              </div>

              <button
                onClick={() => setLayout((prev) => (prev === "vertical" ? "horizontal" : "vertical"))}
                disabled={vault.loading}
                title={layout === "vertical" ? "Switch to horizontal" : "Switch to vertical"}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition-colors"
              >
                {layout === "vertical" ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                <span className="hidden sm:inline">{layout === "vertical" ? "Horizontal" : "Vertical"}</span>
              </button>

              <button
                onClick={() => setSortMode((prev) => (prev === "recent" ? "mostCopied" : "recent"))}
                disabled={vault.loading}
                title={sortMode === "mostCopied" ? "Sort: most copied" : "Sort: recent"}
                className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background transition-colors disabled:opacity-50 ${sortMode === "mostCopied" ? "text-foreground bg-surface-active" : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"}`}
              >
                <ArrowDownUp className="w-4 h-4" />
                <span className="hidden sm:inline">{sortMode === "mostCopied" ? "Most copied" : "Recent"}</span>
              </button>

              <button
                onClick={() => {
                  if (vault.data.groups.length === 0) {
                    toast.info("Create a group first");
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
                <Plus className="w-4 h-4" /> Add Command
              </button>
            </div>
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="mb-5 mt-3">
              {tagFilters.length > 0 && (
                <div className="flex items-center justify-end mb-2">
                  <button
                    onClick={() => setTagFilters([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
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
                  {tagsExpanded ? "Show less" : "Show all"}
                </button>
              )}
            </div>
          )}

          {/* Command cards */}
          {((search.trim().length === 0 && vault.commandsLoading && vault.data.commands.length === 0) || (search.trim().length > 0 && searchLoading && searchResults === null)) ? (
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
                  onEdit={(c) => { setEditCmd(c); setCmdModal(true); }}
                  onDelete={(c) => setDeleteTarget({ type: "command", id: c.id, title: c.title })}
                  onToggleFavorite={(id) => {
                    void vault.toggleFavorite(id).catch((e: any) => {
                      toast.error(e?.message ?? "Failed to update favorite");
                    });
                  }}
                  onTagClick={toggleTagFilter}
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
                      Loading more...
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileCode className="w-12 h-12 text-muted-foreground/40 mb-4" />
              {search ? (
                <p className="text-sm text-muted-foreground">No results for \"{search}\"</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No commands yet</p>
                  <p className="text-xs text-muted-foreground">Add your first command to get started.</p>
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
        aria-label="Scroll to top"
        title="Scroll to top"
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
              toast.success("Group updated");
            } else {
              await vault.addGroup(data);
              toast.success("Group created");
            }
          } catch (e: any) {
            toast.error(e?.message ?? "Failed to save group");
            throw e;
          }
        }}
      />

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
              toast.success("Command saved");
            } else {
              await vault.addCommand({ ...data, copyCount: 0 });
              toast.success("Command saved");
            }
          } catch (e: any) {
            toast.error(e?.message ?? "Failed to save command");
            throw e;
          }
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
          setVarModal(null);
        }}
        onCopyRaw={() => {
          if (varModal) {
            navigator.clipboard.writeText(varModal.command);
            void vault.incrementCopy(varModal.id).catch(() => {
              // ignore
            });
          }
          setVarModal(null);
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
            toast.success("Deleted");
          } catch (e: any) {
            toast.error(e?.message ?? "Delete failed");
            throw e;
          }
        }}
      />
    </div>
  );
}

const Index = () => {
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
        toast.info("You must change your password (first login)");
        setOldPassword(loginPassword);
        setNewPassword("");
      } else {
        toast.success("Signed in");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Sign-in failed");
    } finally {
      setLoginLoading(false);
    }
  }, [auth, loginUsername, loginPassword]);

  const handleChangePassword = useCallback(async () => {
    if (newPassword.trim().length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    try {
      setChangeLoading(true);
      await auth.changePassword(oldPassword, newPassword);
      toast.success("Password updated");
      setOldPassword("");
      setNewPassword("");
    } catch (e: any) {
      toast.error(e?.message ?? "Password update failed");
    } finally {
      setChangeLoading(false);
    }
  }, [auth, oldPassword, newPassword]);

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 shadow-lg">
          <div className="flex flex-col items-center text-center mb-6">
            <img src="/icon.png" alt="Command Keeper" className="h-12 w-auto" />
            <h1 className="text-xl font-semibold text-foreground mt-4">Welcome to Command Keeper</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to access your command library.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Username</label>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Password</label>
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
              {loginLoading ? "Signing in..." : "Sign in"}
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
            <h1 className="text-xl font-semibold text-foreground mt-4">Change your password</h1>
            <p className="text-sm text-muted-foreground mt-1">Required on your first login.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Current password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Minimum 6 characters.</p>
            </div>
            <button
              disabled={!canSubmitPasswordChange}
              onClick={handleChangePassword}
              className="w-full px-4 py-2.5 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-60 transition-all font-medium"
            >
              {changeLoading ? "Updating..." : "Update"}
            </button>

            <button
              onClick={() => auth.logout()}
              className="w-full px-4 py-2.5 text-sm rounded-md border border-input hover:bg-surface-hover transition-colors"
            >
              Sign out
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
        toast.success("Signed out");
      }}
    />
  );
};

export default Index;
