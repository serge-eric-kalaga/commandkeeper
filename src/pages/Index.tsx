import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Plus, FileCode } from "lucide-react";
import { toast } from "sonner";
import { useCommandVault, Command, Group, VaultData } from "@/hooks/useCommandVault";
import { useTheme } from "@/hooks/useTheme";
import AppSidebar from "@/components/AppSidebar";
import CommandCard from "@/components/CommandCard";
import GroupModal from "@/components/GroupModal";
import CommandModal from "@/components/CommandModal";
import VariableModal from "@/components/VariableModal";
import DeleteModal from "@/components/DeleteModal";

const Index = () => {
  const vault = useCommandVault();
  const theme = useTheme();

  const [activeView, setActiveView] = useState("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Modals
  const [groupModal, setGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [cmdModal, setCmdModal] = useState(false);
  const [editCmd, setEditCmd] = useState<Command | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "command" | "group"; id: string; title: string } | null>(null);
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
    let cmds = vault.data.commands;

    if (activeView === "favorites") {
      cmds = cmds.filter((c) => c.isFavorite);
    } else if (activeView.startsWith("group:")) {
      const gid = activeView.slice(6);
      cmds = cmds.filter((c) => c.groupId === gid);
    }

    if (tagFilter) {
      cmds = cmds.filter((c) => c.tags.includes(tagFilter));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      cmds = cmds.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.command.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return cmds;
  }, [vault.data.commands, activeView, search, tagFilter]);

  // Current group
  const currentGroup = activeView.startsWith("group:")
    ? vault.data.groups.find((g) => g.id === activeView.slice(6))
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
      vault.incrementCopy(cmd.id);
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
        const prevG = vault.data.groups.length;
        const prevC = vault.data.commands.length;
        vault.importData(imported);
        // Compute after import via setTimeout
        setTimeout(() => {
          const newG = vault.data.groups.length - prevG;
          const newC = vault.data.commands.length - prevC;
          toast.success(`Imported successfully`);
        }, 100);
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
        activeView={activeView}
        onViewChange={(v) => { setActiveView(v); setSearch(""); setTagFilter(null); }}
        onNewGroup={() => { setEditGroup(null); setGroupModal(true); }}
        onExport={vault.exportData}
        onImport={handleImport}
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
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                {currentGroup && <span className="text-2xl">{currentGroup.icon}</span>}
                <h1 className="text-xl font-semibold text-foreground">{viewTitle}</h1>
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="vault-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commands... (Ctrl+K)"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={() => { setEditCmd(null); setCmdModal(true); }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 transition-all font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Add Command
            </button>
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
          {filteredCommands.length > 0 ? (
            <div className="grid gap-3">
              {filteredCommands.map((cmd) => (
                <CommandCard
                  key={cmd.id}
                  cmd={cmd}
                  onCopy={handleCopy}
                  onEdit={(c) => { setEditCmd(c); setCmdModal(true); }}
                  onDelete={(c) => setDeleteTarget({ type: "command", id: c.id, title: c.title })}
                  onToggleFavorite={vault.toggleFavorite}
                  onTagClick={setTagFilter}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileCode className="w-12 h-12 text-muted-foreground/40 mb-4" />
              {search ? (
                <p className="text-sm text-muted-foreground">No results for "{search}"</p>
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
        onSave={(data) => {
          if (editGroup) {
            vault.updateGroup(editGroup.id, data);
            toast.success("Group updated");
          } else {
            vault.addGroup(data);
            toast.success("Group created");
          }
        }}
      />

      <CommandModal
        open={cmdModal}
        command={editCmd}
        groups={vault.data.groups}
        defaultGroupId={currentGroup?.id}
        onClose={() => setCmdModal(false)}
        onSave={(data) => {
          if (editCmd) {
            vault.updateCommand(editCmd.id, data);
            toast.success("Command saved");
          } else {
            vault.addCommand(data);
            toast.success("Command saved");
          }
        }}
      />

      <VariableModal
        open={!!varModal}
        command={varModal?.command ?? ""}
        onClose={() => setVarModal(null)}
        onCopyWithValues={(result) => {
          navigator.clipboard.writeText(result);
          if (varModal) vault.incrementCopy(varModal.id);
          toast.success("Copied!");
          setVarModal(null);
        }}
        onCopyRaw={() => {
          if (varModal) {
            navigator.clipboard.writeText(varModal.command);
            vault.incrementCopy(varModal.id);
          }
          toast.success("Copied!");
          setVarModal(null);
        }}
      />

      <DeleteModal
        open={!!deleteTarget}
        title={deleteTarget?.title ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?.type === "command") {
            vault.deleteCommand(deleteTarget.id);
          } else if (deleteTarget?.type === "group") {
            vault.deleteGroup(deleteTarget.id);
            if (activeView === `group:${deleteTarget.id}`) setActiveView("all");
          }
          toast.success("Deleted");
        }}
      />
    </div>
  );
};

export default Index;
