import { useState, useEffect, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Command, Group } from "@/hooks/useCommandVault";

interface Props {
  command?: Command | null;
  groups: Group[];
  defaultGroupId?: string;
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Command, "id" | "createdAt" | "updatedAt" | "copyCount">) => void;
}

export default function CommandModal({ command, groups, defaultGroupId, open, onClose, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [cmd, setCmd] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(command?.title ?? "");
      setCmd(command?.command ?? "");
      setDescription(command?.description ?? "");
      setTags(command?.tags ?? []);
      setTagInput("");
      setGroupId(command?.groupId ?? defaultGroupId ?? groups[0]?.id ?? "");
      setIsFavorite(command?.isFavorite ?? false);
    }
  }, [open, command, defaultGroupId, groups]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleTagKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold mb-4 text-card-foreground">{command ? "Edit Command" : "New Command"}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder="Command title" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Command *</label>
            <textarea value={cmd} onChange={(e) => setCmd(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent-blue resize-y" placeholder="docker run -it {{image}}" />
            <p className="text-[11px] text-muted-foreground mt-1">Use {"{{variable_name}}"} for dynamic variables</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder="Optional description" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-secondary text-secondary-foreground">
                  {tag}
                  <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKey} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder="Type tag and press Enter" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors">Cancel</button>
          <button
            onClick={() => {
              if (title.trim() && cmd.trim() && groupId) {
                onSave({ title: title.trim(), command: cmd.trim(), description, tags, groupId, isFavorite });
                onClose();
              }
            }}
            disabled={!title.trim() || !cmd.trim()}
            className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-40 transition-all font-medium"
          >
            {command ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
