import { useState } from "react";
import { Star, Copy, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Command } from "@/hooks/useCommandVault";

function renderBash(commandText: string) {
  const re = /(\s+|\"(?:[^\"\\]|\\.)*\"|'[^']*'|\{\{\w+\}\}|>>|\|\||&&|[|;<>]|--?[a-zA-Z0-9][a-zA-Z0-9_-]*|[^\s]+)/g;
  const tokens = commandText.match(re) ?? [commandText];

  let seenWord = false;

  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return tok;

    let className = "";

    // ANSI mapping requested:
    // - Red (31): operators
    // - Green (32): command/program
    // - Yellow (33): strings
    // - Blue (34): template vars {{var}}
    // - Cyan (36): flags (simulated by a lighter blue)
    // - Reset (0): inherit from the code block (text-code-fg)

    if (/^\{\{\w+\}\}$/.test(tok)) {
      // Blue (34)
      className = "text-accent-blue font-medium";
    } else if (/^(\"(?:[^\"\\]|\\.)*\"|'[^']*')$/.test(tok)) {
      // Yellow (33)
      className = "text-yellow-400";
    } else if (/^(>>|\|\||&&|[|;<>])$/.test(tok)) {
      // Red (31)
      className = "text-destructive";
    } else if (/^--?[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tok)) {
      // Cyan (36)
      className = "text-accent-blue/80";
    } else if (!seenWord) {
      // Green (32)
      className = "text-success font-semibold";
      seenWord = true;
    } else {
      // Reset (0)
      className = "";
    }

    return (
      <span key={i} className={className}>
        {tok}
      </span>
    );
  });
}

interface Props {
  cmd: Command;
  groupColor?: string;
  onCopy: (cmd: Command) => void;
  onEdit: (cmd: Command) => void;
  onDelete: (cmd: Command) => void;
  onToggleFavorite: (id: number) => void;
  onTagClick: (tag: string) => void;
}

export default function CommandCard({ cmd, groupColor, onCopy, onEdit, onDelete, onToggleFavorite, onTagClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = cmd.command.length > 80;

  return (
    <div className="border border-border rounded-lg bg-card p-4 hover:border-muted-foreground/30 transition-colors animate-fade-in border-l-[3px]" style={{ borderLeftColor: groupColor || 'var(--border)' }}>
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-sm text-card-foreground leading-snug">{cmd.title}</h3>
        <button onClick={() => onToggleFavorite(cmd.id)} className="shrink-0 p-0.5">
          <Star className={`w-4 h-4 transition-colors ${cmd.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
        </button>
      </div>

      {/* Command block */}
      <div className="relative group">
        <pre className={`bg-code-bg text-code-fg font-mono text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all ${!expanded && isLong ? "max-h-[60px] overflow-hidden" : ""
          }`}>
          {renderBash(cmd.command)}
        </pre>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Description */}
      {cmd.description && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{cmd.description}</p>
      )}

      {/* Tags */}
      {cmd.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {cmd.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className="px-2 py-0.5 text-[11px] rounded-full bg-secondary text-secondary-foreground hover:bg-surface-hover transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-[11px] text-muted-foreground">
          Copied {cmd.copyCount} time{cmd.copyCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const hasVars = /\{\{\w+\}\}/.test(cmd.command);
              onCopy(cmd);
              if (!hasVars) toast.success("Copied!");
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          <button onClick={() => onEdit(cmd)} className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button onClick={() => onDelete(cmd)} className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
