import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  command: string;
  defaults?: Record<string, string>;
  onClose: () => void;
  onCopyWithValues: (result: string) => void;
  onCopyRaw: () => void;
}

function extractVars(cmd: string): string[] {
  const matches = cmd.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export default function VariableModal({ open, command, defaults, onClose, onCopyWithValues, onCopyRaw }: Props) {
  const vars = extractVars(command);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      vars.forEach((v) => {
        init[v] = defaults?.[v] ?? "";
      });
      setValues(init);
    }
  }, [open, command, defaults]);

  if (!open || vars.length === 0) return null;

  const replace = () => {
    let result = command;
    Object.entries(values).forEach(([k, v]) => {
      result = result.split(`{{${k}}}`).join(v);
    });
    onCopyWithValues(result);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 animate-fade-in">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold mb-1 text-card-foreground">Fill Variables</h2>
        <p className="text-xs text-muted-foreground mb-4">Enter values for the template variables below.</p>

        <div className="space-y-3">
          {vars.map((v) => (
            <div key={v}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block font-mono">{`{{${v}}}`}</label>
              <input
                value={values[v] || ""}
                onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-accent-blue"
                placeholder={v}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCopyRaw} className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors">Copy as-is</button>
          <button onClick={replace} className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 transition-all font-medium">Copy with values</button>
        </div>
      </div>
    </div>
  );
}
