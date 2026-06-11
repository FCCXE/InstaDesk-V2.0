import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export type MonitorId = "M1" | "M2" | "M3" | "M4";

export interface EditLayoutModel {
  id: string;
  name: string;
  monitors: MonitorId[];
  notes?: string;
}

export interface EditLayoutDrawerProps {
  open: boolean;
  model: EditLayoutModel | null;
  onSave: (updated: EditLayoutModel) => void;
  onClose: () => void;
}

export default function EditLayoutDrawer({
  open,
  model,
  onSave,
  onClose,
}: EditLayoutDrawerProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [monitors, setMonitors] = useState<MonitorId[]>([]);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open && model) {
      setName(model.name ?? "");
      setMonitors(model.monitors ?? []);
      setNotes(model.notes ?? "");
      setTouched(false);
    }
  }, [open, model]);

  const errors = useMemo(
    () => ({
      name: name.trim().length === 0 ? t("editLayout.errName") : "",
      monitors: monitors.length === 0 ? t("editLayout.errMonitors") : "",
    }),
    [name, monitors, t]
  );
  const isInvalid = !!(errors.name || errors.monitors);

  function toggleMonitor(m: MonitorId) {
    setMonitors((curr) => (curr.includes(m) ? curr.filter((x) => x !== m) : [...curr, m]));
    setTouched(true);
  }

  function handleSave() {
    if (!model) return;
    setTouched(true);
    if (isInvalid) return;
    onSave({
      id: model.id,
      name: name.trim(),
      monitors: [...monitors],
      notes: notes.trim(),
    });
  }

  function handleCancel() {
    if (touched && !window.confirm(t("editLayout.confirmDiscard"))) return;
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, name, monitors, notes, touched, isInvalid, model]);

  if (!open || !model) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/20" onClick={handleCancel} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-[80] flex h-full w-[480px] flex-col border-l border-line bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t("editLayout.title")}
      >
        <div className="flex items-start justify-between px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-fg">{t("editLayout.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("editLayout.subtitle")}</p>
          </div>
          <button
            className="rounded-md border border-line bg-raised px-3 py-2 text-xs text-fg hover:bg-raised"
            onClick={handleCancel}
          >
            {t("browseApp.close")}
          </button>
        </div>

        <div className="h-px w-full bg-line/70" />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <label className="block text-xs font-medium text-muted">{t("editLayout.nameLabel")}</label>
          <input
            className={`mt-1 h-9 w-full rounded-md border px-3 text-sm outline-none ${
              errors.name && touched
                ? "border-rose-400 focus:ring-2 focus:ring-rose-200"
                : "border-line focus:ring-2 focus:ring-ring"
            }`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
            placeholder={t("editLayout.namePlaceholder")}
            maxLength={60}
          />
          {errors.name && touched && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}

          <div className="mt-5">
            <div className="text-xs font-medium text-muted">{t("editLayout.monitorsLabel")}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["M1", "M2", "M3", "M4"] as MonitorId[]).map((m) => {
                const active = monitors.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMonitor(m)}
                    className={[
                      "h-7 rounded-full border px-3 text-xs font-medium",
                      active
                        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300"
                        : "border-line bg-raised text-fg hover:bg-raised",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            {errors.monitors && touched && (
              <p className="mt-2 text-xs text-rose-600">{errors.monitors}</p>
            )}
          </div>

          <div className="mt-5">
            <div className="text-xs font-medium text-muted">{t("editLayout.notesLabel")}</div>
            <textarea
              className="mt-1 h-28 w-full resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder={t("editLayout.notesPlaceholder")}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setTouched(true);
              }}
            />
          </div>
        </div>

        <div className="h-px w-full bg-line/70" />
        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-xs text-muted">{t("editLayout.footerHint")}</div>
          <div className="flex items-center gap-3">
            <button
              className="h-9 rounded-md border border-line bg-raised px-4 text-xs font-medium text-fg hover:bg-raised"
              onClick={handleCancel}
            >
              {t("browseApp.cancel")}
            </button>
            <button
              className={`h-9 rounded-md px-4 text-xs font-medium text-on-primary ${
                isInvalid ? "cursor-not-allowed bg-primary/40" : "bg-primary hover:bg-primary-hover"
              }`}
              onClick={handleSave}
              disabled={isInvalid}
            >
              {t("browseApp.save")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
