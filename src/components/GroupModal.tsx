import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Group } from "@/hooks/useCommandVault";

const EMOJI_PRESETS = ["📁", "🐳", "🚀", "⚙️", "🔧", "💻", "🌐", "📦", "🎯", "🔒", "📝", "🎨"];
const COLOR_PRESETS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface Props {
  group?: Group | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; icon: string; color: string }) => void;
}

export default function GroupModal({ group, open, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📁");
  const [color, setColor] = useState("#3b82f6");

  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setDescription(group?.description ?? "");
      setIcon(group?.icon ?? "📁");
      setColor(group?.color ?? "#3b82f6");
    }
  }, [open, group]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 animate-fade-in">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold mb-4 text-card-foreground">{group ? "Edit Group" : "New Group"}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder="Group name" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder="Optional description" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Icon</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_PRESETS.map((e) => (
                <button key={e} onClick={() => setIcon(e)} className={`w-9 h-9 flex items-center justify-center rounded-md text-lg transition-colors ${icon === e ? "bg-surface-active ring-2 ring-accent-blue" : "bg-secondary hover:bg-surface-hover"}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-offset-card ring-accent-blue scale-110" : "hover:scale-110"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors">Cancel</button>
          <button
            onClick={() => { if (name.trim()) { onSave({ name: name.trim(), description, icon, color }); onClose(); } }}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-40 transition-all font-medium"
          >
            {group ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
