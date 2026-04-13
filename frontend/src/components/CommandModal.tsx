import { useState, useEffect, KeyboardEvent, useMemo } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { Command, Group } from "@/hooks/useCommandVault";
import { Button } from "@/components/ui/button";
import {
  Command as CommandListRoot,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface Props {
  command?: Command | null;
  groups: Group[];
  defaultGroupId?: number;
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Command, "id" | "createdAt" | "updatedAt" | "copyCount">) => Promise<void>;
}

function extractVars(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export default function CommandModal({ command, groups, defaultGroupId, open, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [cmd, setCmd] = useState("");
  const [description, setDescription] = useState("");
  const [defaultVariables, setDefaultVariables] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [groupId, setGroupId] = useState<number>(0);
  const [groupOpen, setGroupOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);

  const varsInCommand = useMemo(() => extractVars(cmd), [cmd]);

  useEffect(() => {
    if (open) {
      setTitle(command?.title ?? "");
      setCmd(command?.command ?? "");
      setDescription(command?.description ?? "");
      {
        const vars = extractVars(command?.command ?? "");
        const existing = command?.defaultVariables ?? {};
        const init: Record<string, string> = {};
        vars.forEach((v) => {
          init[v] = existing[v] ?? "";
        });
        setDefaultVariables(init);
      }
      setTags(command?.tags ?? []);
      setTagInput("");
      setGroupId(command?.groupId ?? defaultGroupId ?? groups[0]?.id ?? 0);
      setIsFavorite(command?.isFavorite ?? false);
      setSaving(false);
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

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => {
            if (!saving) onClose();
          }}
          disabled={saving}
          className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold mb-4 text-card-foreground">{command ? t("commandModal.editTitle") : t("commandModal.newTitle")}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("commandModal.titleLabel")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder={t("commandModal.titlePlaceholder")} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("commandModal.commandLabel")}</label>
            <textarea
              value={cmd}
              onChange={(e) => {
                const next = e.target.value;
                setCmd(next);
                const vars = extractVars(next);
                setDefaultVariables((prev) => {
                  const nextDefaults: Record<string, string> = {};
                  vars.forEach((v) => {
                    nextDefaults[v] = prev[v] ?? "";
                  });
                  return nextDefaults;
                });
              }}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent-blue resize-y"
              placeholder={t("commandModal.commandPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t("commandModal.varsHint", { example: "{{variable_name}}" })}
            </p>
          </div>

          {varsInCommand.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("commandModal.defaultVariables")}</label>
              <div className="space-y-2">
                {varsInCommand.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-mono shrink-0 w-[110px]">{`{{${v}}}`}</span>
                    <input
                      value={defaultVariables[v] ?? ""}
                      onChange={(e) => setDefaultVariables({ ...defaultVariables, [v]: e.target.value })}
                      className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      placeholder={v}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{t("commandModal.defaultsHint")}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("commandModal.descriptionLabel")}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder={t("commandModal.descriptionPlaceholder")} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("commandModal.tagsLabel")}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-secondary text-secondary-foreground">
                  {tag}
                  <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKey} className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue" placeholder={t("commandModal.tagsPlaceholder")} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("commandModal.groupLabel")}</label>
            <Popover open={groupOpen} onOpenChange={setGroupOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={groupOpen}
                  className="w-full justify-between h-auto px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground hover:bg-background"
                >
                  <span className={cn("truncate", !selectedGroup && "text-muted-foreground")}>
                    {selectedGroup ? `${selectedGroup.icon} ${selectedGroup.name}` : t("commandModal.groupSelect")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <CommandListRoot>
                  <CommandInput placeholder={t("commandModal.groupSearch")} />
                  <CommandList>
                    <CommandEmpty>{t("commandModal.groupEmpty")}</CommandEmpty>
                    <CommandGroup>
                      {groups.map((g) => (
                        <CommandItem
                          key={g.id}
                          value={`${g.name} ${g.icon}`}
                          onSelect={() => {
                            setGroupId(g.id);
                            setGroupOpen(false);
                          }}
                          className="flex items-center gap-2"
                        >
                          <Check className={cn("h-4 w-4", groupId === g.id ? "opacity-100" : "opacity-0")} />
                          <span className="text-base leading-none">{g.icon}</span>
                          <span className="truncate">{g.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </CommandListRoot>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={async () => {
              if (!title.trim() || !cmd.trim() || !groupId || saving) return;
              try {
                setSaving(true);
                const normalizedDefaults: Record<string, string> = {};
                varsInCommand.forEach((v) => {
                  normalizedDefaults[v] = defaultVariables[v] ?? "";
                });
                await onSave({
                  title: title.trim(),
                  command: cmd.trim(),
                  description,
                  defaultVariables: normalizedDefaults,
                  tags,
                  groupId,
                  isFavorite,
                });
                onClose();
              } catch {
                // Keep modal open; caller is responsible for user feedback.
              } finally {
                setSaving(false);
              }
            }}
            disabled={!title.trim() || !cmd.trim() || saving}
            className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 disabled:opacity-40 transition-all font-medium inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {command ? t("common.save") : t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
