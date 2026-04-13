import { useEffect, useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteModal({ open, title, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setDeleting(false);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!deleting) onClose();
        }}
      />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-sm p-6 animate-fade-in">
        <button
          onClick={() => {
            if (!deleting) onClose();
          }}
          disabled={deleting}
          className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-full bg-destructive/10">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-card-foreground">{t("deleteModal.title")}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {t("deleteModal.body", { title })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              if (!deleting) onClose();
            }}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-md hover:bg-surface-hover text-muted-foreground transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={async () => {
              if (deleting) return;
              try {
                setDeleting(true);
                await onConfirm();
                onClose();
              } catch {
                // Keep modal open; caller is responsible for user feedback.
              } finally {
                setDeleting(false);
              }
            }}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-60 transition-all font-medium inline-flex items-center gap-2"
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("deleteModal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
