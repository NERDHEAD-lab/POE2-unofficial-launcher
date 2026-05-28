import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BuildEntry } from "../../shared/types";

type SortKey = "name" | "class" | "lastEdited" | "level";

interface BuildListViewProps {
  onOpen: (subPath: string, fileName: string) => void;
}

interface ClipboardState {
  mode: "copy" | "cut";
  subPath: string;
  name: string;
  kind: "file" | "folder";
}

interface PromptState {
  title: string;
  prompt: string;
  initial: string;
  onSubmit: (value: string) => void;
}

interface ConfirmState {
  title: string;
  message: string;
  onConfirm: () => void;
}

const SORT_KEYS: SortKey[] = ["name", "class", "lastEdited", "level"];

const sortEntries = (entries: BuildEntry[], sortKey: SortKey): BuildEntry[] => {
  const folders = entries.filter((e) => e.kind === "folder");
  const files = entries.filter((e) => e.kind === "file");
  const compare = (a: BuildEntry, b: BuildEntry): number => {
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name, "ko");
      case "class":
        return (a.className ?? "").localeCompare(b.className ?? "", "ko");
      case "lastEdited":
        return b.mtime - a.mtime;
      case "level":
        return (b.level ?? 0) - (a.level ?? 0);
    }
  };
  folders.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  files.sort(compare);
  return [...folders, ...files];
};

export const BuildListView: React.FC<BuildListViewProps> = ({ onOpen }) => {
  const { t } = useTranslation();
  const api = window.pobAPI?.builds;

  const [subPath, setSubPath] = useState<string>("");
  const [history, setHistory] = useState<string[]>([""]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [entries, setEntries] = useState<BuildEntry[]>([]);
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selected, setSelected] = useState<BuildEntry | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    const result = await api.list(subPath);
    setEntries(result.entries);
    setSelected(null);
  }, [api, subPath]);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.list(subPath).then((result) => {
      if (cancelled) return;
      setEntries(result.entries);
      setSelected(null);
    });
    return () => {
      cancelled = true;
    };
  }, [api, subPath]);

  const goTo = useCallback(
    (next: string) => {
      const trimmed = history.slice(0, historyIdx + 1);
      trimmed.push(next);
      setHistory(trimmed);
      setHistoryIdx(trimmed.length - 1);
      setSubPath(next);
    },
    [history, historyIdx],
  );

  const goBack = useCallback(() => {
    if (historyIdx <= 0) return;
    const idx = historyIdx - 1;
    setHistoryIdx(idx);
    setSubPath(history[idx]);
  }, [history, historyIdx]);

  const goForward = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const idx = historyIdx + 1;
    setHistoryIdx(idx);
    setSubPath(history[idx]);
  }, [history, historyIdx]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sortEntries(entries, sortKey);
    if (!q) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.className ?? "").toLowerCase().includes(q) ||
        (e.ascendClassName ?? "").toLowerCase().includes(q),
    );
  }, [entries, sortKey, search]);

  const breadcrumb = useMemo(() => {
    if (!subPath) return [{ label: t("buildList.breadcrumb.root"), path: "" }];
    const parts = subPath.split(/[\\/]+/).filter(Boolean);
    const crumbs = [{ label: t("buildList.breadcrumb.root"), path: "" }];
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      crumbs.push({ label: p, path: acc });
    }
    return crumbs;
  }, [subPath, t]);

  const handleMutation = useCallback(
    async (result: { status: "ok" } | { status: "error"; reason: string }) => {
      if (result.status === "ok") {
        setError(null);
        await refresh();
      } else {
        setError(t("buildList.error.generic", { reason: result.reason }));
      }
    },
    [refresh, t],
  );

  const handleNew = useCallback(() => {
    setPrompt({
      title: t("buildList.dialog.newFolder.title"),
      prompt: t("buildList.dialog.rename.prompt"),
      initial: "New Build",
      onSubmit: (name) => {
        setPrompt(null);
        onOpen(subPath, name);
      },
    });
  }, [onOpen, subPath, t]);

  const handleNewFolder = useCallback(() => {
    if (!api) return;
    setPrompt({
      title: t("buildList.dialog.newFolder.title"),
      prompt: t("buildList.dialog.newFolder.prompt"),
      initial: "",
      onSubmit: async (name) => {
        setPrompt(null);
        const trimmed = name.trim();
        if (!trimmed) return;
        await handleMutation(await api.newFolder(subPath, trimmed));
      },
    });
  }, [api, handleMutation, subPath, t]);

  const handleOpen = useCallback(() => {
    if (!selected) return;
    if (selected.kind === "folder") {
      const next = subPath ? `${subPath}/${selected.name}` : selected.name;
      goTo(next);
    } else {
      onOpen(subPath, selected.name);
    }
  }, [goTo, onOpen, selected, subPath]);

  const handleCopy = useCallback(() => {
    if (!selected) return;
    setClipboard({
      mode: "copy",
      subPath,
      name: selected.name,
      kind: selected.kind,
    });
  }, [selected, subPath]);

  const handleCut = useCallback(() => {
    if (!selected || selected.kind !== "file") return;
    setClipboard({
      mode: "cut",
      subPath,
      name: selected.name,
      kind: selected.kind,
    });
  }, [selected, subPath]);

  const handlePaste = useCallback(async () => {
    if (!api || !clipboard || clipboard.kind !== "file") return;
    if (clipboard.subPath === subPath) {
      // same folder paste → rename prompt (PoB 동작)
      setPrompt({
        title: t("buildList.dialog.rename.title"),
        prompt: t("buildList.dialog.rename.prompt"),
        initial: `${clipboard.name} Copy`,
        onSubmit: async (newName) => {
          setPrompt(null);
          const trimmed = newName.trim();
          if (!trimmed) return;
          await handleMutation(
            await api.copyBuild(
              clipboard.subPath,
              clipboard.name,
              subPath,
              trimmed,
            ),
          );
          if (clipboard.mode === "cut") {
            await handleMutation(
              await api.deleteBuild(clipboard.subPath, clipboard.name, "file"),
            );
          }
          setClipboard(null);
        },
      });
      return;
    }
    await handleMutation(
      await api.copyBuild(
        clipboard.subPath,
        clipboard.name,
        subPath,
        clipboard.name,
      ),
    );
    if (clipboard.mode === "cut") {
      await handleMutation(
        await api.deleteBuild(clipboard.subPath, clipboard.name, "file"),
      );
    }
    setClipboard(null);
  }, [api, clipboard, handleMutation, subPath, t]);

  const handleRename = useCallback(() => {
    if (!api || !selected) return;
    setPrompt({
      title: t("buildList.dialog.rename.title"),
      prompt: t("buildList.dialog.rename.prompt"),
      initial: selected.name,
      onSubmit: async (newName) => {
        setPrompt(null);
        const trimmed = newName.trim();
        if (!trimmed || trimmed === selected.name) return;
        await handleMutation(
          await api.renameBuild(subPath, selected.name, trimmed),
        );
      },
    });
  }, [api, handleMutation, selected, subPath, t]);

  const handleDelete = useCallback(() => {
    if (!api || !selected) return;
    setConfirm({
      title: t("buildList.dialog.delete.title"),
      message: t("buildList.dialog.delete.message", { name: selected.name }),
      onConfirm: async () => {
        setConfirm(null);
        await handleMutation(
          await api.deleteBuild(subPath, selected.name, selected.kind),
        );
      },
    });
  }, [api, handleMutation, selected, subPath, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (prompt || confirm) return;
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNew();
      } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
      } else if (e.ctrlKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCut();
      } else if (e.ctrlKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void handlePaste();
      } else if (e.key === "Delete") {
        e.preventDefault();
        handleDelete();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      // MOUSE4 (back) / MOUSE5 (forward)
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [
    confirm,
    goBack,
    goForward,
    handleCopy,
    handleCut,
    handleDelete,
    handleNew,
    handlePaste,
    prompt,
  ]);

  const renderMeta = (entry: BuildEntry): string => {
    if (entry.kind === "folder") return "";
    if (entry.level === undefined && !entry.className) return "";
    return t("buildList.meta.level", {
      level: entry.level ?? "?",
      ascendancy:
        entry.ascendClassName ||
        entry.className ||
        t("buildList.meta.unknownClass"),
    });
  };

  const selDisabled = !selected;

  return (
    <div className="pob-buildlist">
      <div className="pob-toolbar">
        <button className="pob-btn" onClick={handleNew}>
          {t("buildList.toolbar.new")}
        </button>
        <button className="pob-btn" onClick={handleNewFolder}>
          {t("buildList.toolbar.newFolder")}
        </button>
        <button className="pob-btn" onClick={handleOpen} disabled={selDisabled}>
          {t("buildList.toolbar.open")}
        </button>
        <button className="pob-btn" onClick={handleCopy} disabled={selDisabled}>
          {t("buildList.toolbar.copy")}
        </button>
        <button
          className="pob-btn"
          onClick={handleRename}
          disabled={selDisabled}
        >
          {t("buildList.toolbar.rename")}
        </button>
        <button
          className="pob-btn pob-btn-danger"
          onClick={handleDelete}
          disabled={selDisabled}
        >
          {t("buildList.toolbar.delete")}
        </button>
        <label className="pob-sort">
          {t("buildList.toolbar.sort")}:
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`buildList.sort.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pob-search">
        <input
          type="text"
          placeholder={t("buildList.search.placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="pob-breadcrumb">
        {breadcrumb.map((c, i) => (
          <React.Fragment key={c.path}>
            {i > 0 && <span className="pob-breadcrumb-sep">▶</span>}
            <button
              className="pob-breadcrumb-item"
              onClick={() => goTo(c.path)}
            >
              {c.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {error && <div className="pob-error">{error}</div>}

      <ul className="pob-list">
        {filtered.length === 0 && (
          <li className="pob-list-empty">{t("buildList.empty")}</li>
        )}
        {filtered.map((entry) => (
          <li
            key={`${entry.kind}:${entry.name}`}
            className={
              "pob-list-item" +
              (selected?.name === entry.name && selected.kind === entry.kind
                ? " selected"
                : "")
            }
            onClick={() => setSelected(entry)}
            onDoubleClick={() => {
              setSelected(entry);
              if (entry.kind === "folder") {
                goTo(subPath ? `${subPath}/${entry.name}` : entry.name);
              } else {
                onOpen(subPath, entry.name);
              }
            }}
          >
            <span className="pob-list-name">
              {entry.kind === "folder" ? "📁 " : ""}
              {entry.name}
            </span>
            <span className="pob-list-meta">{renderMeta(entry)}</span>
          </li>
        ))}
      </ul>

      {prompt && (
        <Modal title={prompt.title} onClose={() => setPrompt(null)}>
          <PromptForm
            label={prompt.prompt}
            initial={prompt.initial}
            confirmLabel={t("buildList.dialog.confirm")}
            cancelLabel={t("buildList.dialog.cancel")}
            onCancel={() => setPrompt(null)}
            onSubmit={prompt.onSubmit}
          />
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.message}</p>
          <div className="pob-dialog-actions">
            <button className="pob-btn" onClick={() => setConfirm(null)}>
              {t("buildList.dialog.cancel")}
            </button>
            <button
              className="pob-btn pob-btn-danger"
              onClick={confirm.onConfirm}
            >
              {t("buildList.dialog.confirm")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="pob-modal-overlay" onClick={onClose}>
    <div className="pob-modal" onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      {children}
    </div>
  </div>
);

const PromptForm: React.FC<{
  label: string;
  initial: string;
  confirmLabel: string;
  cancelLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}> = ({ label, initial, confirmLabel, cancelLabel, onSubmit, onCancel }) => {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <label>{label}</label>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="pob-dialog-actions">
        <button type="button" className="pob-btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="submit" className="pob-btn pob-btn-primary">
          {confirmLabel}
        </button>
      </div>
    </form>
  );
};
