import { useState, useRef } from "react";
import {
  Terminal, Star, FolderOpen, Plus, Download, Upload, Sun, Moon, Menu, X,
} from "lucide-react";
import { Group } from "@/hooks/useCommandVault";

interface SidebarProps {
  groups: Group[];
  commands: { groupId: string }[];
  activeView: string;
  onViewChange: (view: string) => void;
  onNewGroup: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  dark: boolean;
  onToggleTheme: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (id: string) => void;
}

export default function AppSidebar({
  groups, commands, activeView, onViewChange, onNewGroup,
  onExport, onImport, dark, onToggleTheme, onEditGroup, onDeleteGroup,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const commandCount = (groupId: string) => commands.filter((c) => c.groupId === groupId).length;
  const favCount = (commands as any[]).filter((c) => c.isFavorite).length;

  const nav = (view: string) => {
    onViewChange(view);
    setMobileOpen(false);
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent-blue" />
          <span className="font-semibold text-sm tracking-tight text-sidebar-fg">Command Vault</span>
        </div>
        <button onClick={onToggleTheme} className="p-1.5 rounded-md hover:bg-surface-hover transition-colors text-sidebar-muted">
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <button
          onClick={() => nav("all")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
            activeView === "all" ? "bg-surface-active text-foreground font-medium" : "text-sidebar-fg hover:bg-surface-hover"
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>All Commands</span>
          <span className="ml-auto text-xs text-sidebar-muted">{commands.length}</span>
        </button>

        <button
          onClick={() => nav("favorites")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
            activeView === "favorites" ? "bg-surface-active text-foreground font-medium" : "text-sidebar-fg hover:bg-surface-hover"
          }`}
        >
          <Star className="w-4 h-4" />
          <span>Favorites</span>
          <span className="ml-auto text-xs text-sidebar-muted">{favCount}</span>
        </button>

        {/* Groups */}
        <div className="pt-4">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Groups</span>
            <button onClick={onNewGroup} className="p-0.5 rounded hover:bg-surface-hover text-sidebar-muted transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => nav(`group:${g.id}`)}
              onContextMenu={(e) => {
                e.preventDefault();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors group ${
                activeView === `group:${g.id}` ? "bg-surface-active text-foreground font-medium" : "text-sidebar-fg hover:bg-surface-hover"
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-base leading-none">{g.icon}</span>
              <span className="truncate">{g.name}</span>
              <span className="ml-auto text-xs text-sidebar-muted">{commandCount(g.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border flex items-center gap-1">
        <button onClick={onExport} title="Export JSON" className="p-2 rounded-md hover:bg-surface-hover text-sidebar-muted transition-colors">
          <Download className="w-4 h-4" />
        </button>
        <button onClick={() => fileRef.current?.click()} title="Import JSON" className="p-2 rounded-md hover:bg-surface-hover text-sidebar-muted transition-colors">
          <Upload className="w-4 h-4" />
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = "";
        }} />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded-md bg-card border border-border md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[260px] min-w-[260px] border-r border-sidebar-border bg-sidebar-bg h-screen sticky top-0 flex-col">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-sidebar-bg border-r border-sidebar-border flex flex-col animate-fade-in">
            <button onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-surface-hover text-sidebar-muted">
              <X className="w-4 h-4" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
