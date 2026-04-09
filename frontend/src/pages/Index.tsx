import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Plus, FileCode, Loader2, LayoutGrid, LayoutList, ArrowDownUp } from "lucide-react";
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

  const [activeView, setActiveView] = useState("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
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

  // Filtered commands
  const filteredCommands = useMemo(() => {
    const isServerSearch = search.trim().length > 0;
    let cmds = isServerSearch ? [...(searchResults ?? [])] : [...vault.data.commands];

    if (activeView === "favorites") {
      cmds = cmds.filter((c) => c.isFavorite);
    } else if (activeView.startsWith("group:")) {
      const gid = Number(activeView.slice(6));
      cmds = cmds.filter((c) => c.groupId === gid);
    }

    if (tagFilter) {
      cmds = cmds.filter((c) => c.tags.includes(tagFilter));
    }

    if (sortMode === "mostCopied") {
      cmds.sort((a, b) => {
        if (b.copyCount !== a.copyCount) return b.copyCount - a.copyCount;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    }

    return cmds;
  }, [vault.data.commands, activeView, search, tagFilter, sortMode, searchResults]);

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

  // All tags for filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    filteredCommands.forEach((c) => c.tags.forEach((t) => tags.add(t)));
    return [...tags].sort();
  }, [filteredCommands]);

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
      toast.success("Copied!");
    }
  }, [vault]);

  // Import handler
  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as VaultData;
        if (!imported.groups || !imported.commands) throw new Error();
        void vault
          .importData(imported)
          .then(({ groups, commands }) => {
            toast.success(`Imported successfully (${groups} groups, ${commands} commands)`);
          })
          .catch((err) => {
            toast.error((err as any)?.message ?? "Import failed");
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
        commands={vault.data.commands}
        loading={vault.loading && vault.data.groups.length === 0 && vault.data.commands.length === 0}
        activeView={activeView}
        onViewChange={(v) => { setActiveView(v); setSearch(""); setTagFilter(null); }}
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
          {vault.loading && vault.data.groups.length === 0 && vault.data.commands.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
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
            <div className="flex flex-wrap gap-1.5 mb-5">
              {tagFilter && (
                <button onClick={() => setTagFilter(null)} className="px-2.5 py-1 text-[11px] rounded-full bg-accent-blue text-accent-blue-foreground font-medium">
                  ✕ {tagFilter}
                </button>
              )}
              {!tagFilter && allTags.map((tag) => (
                <button key={tag} onClick={() => setTagFilter(tag)} className="px-2.5 py-1 text-[11px] rounded-full bg-secondary text-secondary-foreground hover:bg-surface-hover transition-colors">
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Command cards */}
          {(vault.loading && vault.data.commands.length === 0 && vault.data.groups.length === 0) || (search.trim().length > 0 && searchLoading && searchResults === null) ? (
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
                  onTagClick={setTagFilter}
                />
              ))}
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
          toast.success("Copied!");
          setVarModal(null);
        }}
        onCopyRaw={() => {
          if (varModal) {
            navigator.clipboard.writeText(varModal.command);
            void vault.incrementCopy(varModal.id).catch(() => {
              // ignore
            });
          }
          toast.success("Copied!");
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

  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("admin");
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
        <div className="w-full max-w-sm rounded-lg border border-input bg-background p-6">
          <h1 className="text-lg font-semibold text-foreground mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-5">Sign in to access your commands.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Username</label>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <button
              disabled={loginLoading}
              onClick={handleLogin}
              className="w-full px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-60 transition-all font-medium"
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
        <div className="w-full max-w-sm rounded-lg border border-input bg-background p-6">
          <h1 className="text-lg font-semibold text-foreground mb-1">Change password</h1>
          <p className="text-sm text-muted-foreground mb-5">Required on your first login.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Current password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Minimum 6 characters.</p>
            </div>
            <button
              disabled={!canSubmitPasswordChange}
              onClick={handleChangePassword}
              className="w-full px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-60 transition-all font-medium"
            >
              {changeLoading ? "Updating..." : "Update"}
            </button>

            <button
              onClick={() => auth.logout()}
              className="w-full px-4 py-2 text-sm rounded-md border border-input hover:bg-surface-hover transition-colors"
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
