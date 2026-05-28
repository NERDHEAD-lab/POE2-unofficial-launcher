import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  BuildEntry,
  BuildsMutationResult,
} from "@poe2-launcher/shared/types";

import {
  SORT_KEYS,
  canMoveItemToFolder,
  filterBuildEntries,
  getFolderAncestors,
  getFolderName,
  getParentSubPath,
  joinSubPath,
  sortBuildEntries,
} from "./folderTree";
import {
  MAIN_SKILL_SUMMARY_DEFAULT_HEIGHT,
  MAIN_SKILL_SUMMARY_MIN_HEIGHT,
  buildMainSkillSummaryRows,
  clampMainSkillSummaryHeight,
  getMainSkillSummaryMaxHeight,
  getMainSkillSummaryTitle,
} from "./mainSkillSummaryPanel";

import type { BuildTarget, SidebarItemRef, SortKey } from "./folderTree";
import type { MainSkillSummaryPanelState } from "./mainSkillSummaryPanel";

interface SidebarProps {
  currentPath: string;
  selectedFile: string | null;
  autosave: boolean;
  collapsed: boolean;
  mainSkillSummary: MainSkillSummaryPanelState;
  sortKey: SortKey;
  refreshToken: number;
  onAutosaveChange: (enabled: boolean) => void;
  onNewBuild: () => void;
  onSelect: (target: BuildTarget) => void;
  onSortChange: (sortKey: SortKey) => void;
  onToggleCollapse: () => void;
}

interface ClipboardState extends SidebarItemRef {
  mode: "copy" | "cut";
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

type MenuAction = "newFolder" | "paste" | "copy" | "cut" | "rename" | "delete";

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};

const isSameItem = (
  a: SidebarItemRef | null,
  b: SidebarItemRef | null,
): boolean =>
  !!a &&
  !!b &&
  a.kind === b.kind &&
  a.subPath === b.subPath &&
  a.name === b.name;

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  selectedFile,
  autosave,
  collapsed,
  mainSkillSummary,
  sortKey,
  refreshToken,
  onAutosaveChange,
  onNewBuild,
  onSelect,
  onSortChange,
  onToggleCollapse,
}) => {
  const { t } = useTranslation();
  const api = window.pobAPI?.builds;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [entriesByPath, setEntriesByPath] = useState<Map<string, BuildEntry[]>>(
    () => new Map(),
  );
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [search, setSearch] = useState("");
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [dragItem, setDragItem] = useState<SidebarItemRef | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<SidebarItemRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mainSkillCollapsed, setMainSkillCollapsed] = useState(false);
  const [mainSkillPanelHeight, setMainSkillPanelHeight] = useState(
    MAIN_SKILL_SUMMARY_DEFAULT_HEIGHT,
  );
  const [mainSkillPanelMaxHeight, setMainSkillPanelMaxHeight] = useState(() =>
    getMainSkillSummaryMaxHeight(window.innerHeight),
  );
  const mainSkillResizeRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);

  useEffect(() => {
    const syncMaxHeight = () => {
      const nextMax = getMainSkillSummaryMaxHeight(window.innerHeight);
      setMainSkillPanelMaxHeight(nextMax);
      setMainSkillPanelHeight((height) =>
        clampMainSkillSummaryHeight(height, nextMax),
      );
    };

    syncMaxHeight();
    window.addEventListener("resize", syncMaxHeight);
    return () => window.removeEventListener("resize", syncMaxHeight);
  }, []);

  const loadPath = useCallback(
    async (subPath: string) => {
      if (!api) return;
      setLoadingPaths((prev) => new Set(prev).add(subPath));
      try {
        const result = await api.list(subPath);
        setEntriesByPath((prev) => {
          const next = new Map(prev);
          next.set(subPath, result.entries);
          return next;
        });
        setError(null);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        setError(t("buildList.error.generic", { reason }));
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(subPath);
          return next;
        });
      }
    },
    [api, t],
  );

  const refreshPaths = useCallback(
    async (...paths: string[]) => {
      const unique = [...new Set(paths)];
      await Promise.all(unique.map((path) => loadPath(path)));
    },
    [loadPath],
  );

  const currentAncestors = useMemo(
    () => getFolderAncestors(currentPath),
    [currentPath],
  );

  const forcedExpandedPaths = useMemo(() => {
    if (selectedFile) return currentAncestors;
    return currentAncestors.slice(0, -1);
  }, [currentAncestors, selectedFile]);

  const expandedPaths = useMemo(() => {
    const next = new Set(expanded);
    forcedExpandedPaths.forEach((path) => next.add(path));
    return next;
  }, [expanded, forcedExpandedPaths]);

  const selectedItem = useMemo<SidebarItemRef | null>(() => {
    if (selectedFile) {
      return {
        kind: "file",
        subPath: currentPath,
        name: selectedFile,
      };
    }

    if (!currentPath) return null;
    return {
      kind: "folder",
      subPath: getParentSubPath(currentPath),
      name: getFolderName(currentPath, t("buildList.breadcrumb.root")),
    };
  }, [currentPath, selectedFile, t]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refreshPaths(...currentAncestors);
    });
    return () => {
      cancelled = true;
    };
  }, [currentAncestors, refreshPaths, refreshToken]);

  const getVisibleEntries = useCallback(
    (subPath: string): BuildEntry[] =>
      filterBuildEntries(
        sortBuildEntries(entriesByPath.get(subPath) ?? [], sortKey),
        search,
      ),
    [entriesByPath, search, sortKey],
  );

  const handleMutation = useCallback(
    async (
      result: BuildsMutationResult,
      ...pathsToRefresh: string[]
    ): Promise<boolean> => {
      if (result.status === "ok") {
        setError(null);
        await refreshPaths(...pathsToRefresh);
        return true;
      }
      setError(t("buildList.error.generic", { reason: result.reason }));
      return false;
    },
    [refreshPaths, t],
  );

  const handleSelectFolder = useCallback(
    (subPath: string) => {
      onSelect({ subPath, fileName: null });
    },
    [onSelect],
  );

  const handleSelectFile = useCallback(
    (subPath: string, entry: BuildEntry) => {
      onSelect({ subPath, fileName: entry.name });
    },
    [onSelect],
  );

  const handleToggleFolder = useCallback(
    (subPath: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(subPath)) {
          if (subPath) next.delete(subPath);
        } else {
          next.add(subPath);
          void loadPath(subPath);
        }
        return next;
      });
    },
    [loadPath],
  );

  const handleNewFolder = useCallback(
    (subPath: string) => {
      if (!api) return;
      setPrompt({
        title: t("buildList.dialog.newFolder.title"),
        prompt: t("buildList.dialog.newFolder.prompt"),
        initial: "",
        onSubmit: async (name) => {
          setPrompt(null);
          const trimmed = name.trim();
          if (!trimmed) return;
          await handleMutation(await api.newFolder(subPath, trimmed), subPath);
        },
      });
    },
    [api, handleMutation, t],
  );

  const handleCopy = useCallback((item: SidebarItemRef | null) => {
    if (!item || item.kind !== "file") return;
    setClipboard({ ...item, mode: "copy" });
  }, []);

  const handleCut = useCallback((item: SidebarItemRef | null) => {
    if (!item || item.kind !== "file") return;
    setClipboard({ ...item, mode: "cut" });
  }, []);

  const handlePaste = useCallback(
    async (dstSubPath: string) => {
      if (!api || !clipboard || clipboard.kind !== "file") return;
      const finishCut = async () => {
        if (clipboard.mode !== "cut") return true;
        return handleMutation(
          await api.deleteBuild(clipboard.subPath, clipboard.name, "file"),
          clipboard.subPath,
        );
      };

      if (clipboard.subPath === dstSubPath) {
        setPrompt({
          title: t("buildList.dialog.rename.title"),
          prompt: t("buildList.dialog.rename.prompt"),
          initial: `${clipboard.name} Copy`,
          onSubmit: async (newName) => {
            setPrompt(null);
            const trimmed = newName.trim();
            if (!trimmed) return;
            const copied = await handleMutation(
              await api.copyBuild(
                clipboard.subPath,
                clipboard.name,
                dstSubPath,
                trimmed,
              ),
              dstSubPath,
            );
            if (copied && (await finishCut())) setClipboard(null);
          },
        });
        return;
      }

      const copied = await handleMutation(
        await api.copyBuild(
          clipboard.subPath,
          clipboard.name,
          dstSubPath,
          clipboard.name,
        ),
        dstSubPath,
      );
      if (copied && (await finishCut())) setClipboard(null);
    },
    [api, clipboard, handleMutation, t],
  );

  const handleRename = useCallback(
    (item: SidebarItemRef | null) => {
      if (!api || !item) return;
      setPrompt({
        title: t("buildList.dialog.rename.title"),
        prompt: t("buildList.dialog.rename.prompt"),
        initial: item.name,
        onSubmit: async (newName) => {
          setPrompt(null);
          const trimmed = newName.trim();
          if (!trimmed || trimmed === item.name) return;
          const ok = await handleMutation(
            await api.renameBuild(item.subPath, item.name, trimmed),
            item.subPath,
          );
          if (ok && item.kind === "file" && selectedFile === item.name) {
            onSelect({ subPath: item.subPath, fileName: trimmed });
          }
        },
      });
    },
    [api, handleMutation, onSelect, selectedFile, t],
  );

  const handleDelete = useCallback(
    (item: SidebarItemRef | null) => {
      if (!api || !item) return;
      setConfirm({
        title: t("buildList.dialog.delete.title"),
        message: t("buildList.dialog.delete.message", { name: item.name }),
        onConfirm: async () => {
          setConfirm(null);
          const ok = await handleMutation(
            await api.deleteBuild(item.subPath, item.name, item.kind),
            item.subPath,
          );
          if (!ok) return;
          if (item.kind === "file" && selectedFile === item.name) {
            onSelect({ subPath: item.subPath, fileName: null });
          }
          if (item.kind === "folder") {
            const deletedPath = joinSubPath(item.subPath, item.name);
            if (
              currentPath === deletedPath ||
              currentPath.startsWith(`${deletedPath}/`)
            ) {
              onSelect({ subPath: item.subPath, fileName: null });
            }
          }
        },
      });
    },
    [api, currentPath, handleMutation, onSelect, selectedFile, t],
  );

  const runMenuAction = useCallback(
    (action: MenuAction, item: SidebarItemRef) => {
      setMenuItem(null);
      switch (action) {
        case "newFolder":
          if (item.kind === "folder") {
            handleNewFolder(joinSubPath(item.subPath, item.name));
          }
          break;
        case "paste":
          if (item.kind === "folder") {
            void handlePaste(joinSubPath(item.subPath, item.name));
          }
          break;
        case "copy":
          handleCopy(item);
          break;
        case "cut":
          handleCut(item);
          break;
        case "rename":
          handleRename(item);
          break;
        case "delete":
          handleDelete(item);
          break;
      }
    },
    [
      handleCopy,
      handleCut,
      handleDelete,
      handleNewFolder,
      handlePaste,
      handleRename,
    ],
  );

  const canDropOnFolder = useCallback(
    (dstSubPath: string): boolean => {
      if (!dragItem) return false;
      return canMoveItemToFolder(dragItem, dstSubPath);
    },
    [dragItem],
  );

  const handleDropOnFolder = useCallback(
    async (dstSubPath: string) => {
      if (!api || !dragItem || !canDropOnFolder(dstSubPath)) {
        setDropTargetPath(null);
        return;
      }

      const oldPath =
        dragItem.kind === "folder"
          ? joinSubPath(dragItem.subPath, dragItem.name)
          : dragItem.subPath;
      const nextPath =
        dragItem.kind === "folder"
          ? joinSubPath(dstSubPath, dragItem.name)
          : dstSubPath;
      const ok = await handleMutation(
        await api.moveBuild(
          dragItem.subPath,
          dragItem.name,
          dragItem.kind,
          dstSubPath,
        ),
        dragItem.subPath,
        dstSubPath,
        currentPath,
      );

      if (ok) {
        if (
          dragItem.kind === "file" &&
          selectedFile === dragItem.name &&
          currentPath === dragItem.subPath
        ) {
          onSelect({ subPath: dstSubPath, fileName: dragItem.name });
        }
        if (
          dragItem.kind === "folder" &&
          (currentPath === oldPath || currentPath.startsWith(`${oldPath}/`))
        ) {
          onSelect({
            subPath: currentPath.replace(oldPath, nextPath),
            fileName: selectedFile,
          });
        }
      }

      setDragItem(null);
      setDropTargetPath(null);
    },
    [
      api,
      canDropOnFolder,
      currentPath,
      dragItem,
      handleMutation,
      onSelect,
      selectedFile,
    ],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (prompt || confirm || isTypingTarget(event.target)) return;
      if (menuItem && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "escape") {
          event.preventDefault();
          setMenuItem(null);
          return;
        }
        if (menuItem.kind === "file") {
          const actionByKey: Partial<Record<string, MenuAction>> = {
            c: "copy",
            x: "cut",
            r: "rename",
            d: "delete",
          };
          const action = actionByKey[key];
          if (action) {
            event.preventDefault();
            runMenuAction(action, menuItem);
            return;
          }
        }
        if (menuItem.kind === "folder") {
          const actionByKey: Partial<Record<string, MenuAction>> = {
            n: "newFolder",
            p: "paste",
            r: "rename",
            d: "delete",
          };
          const action = actionByKey[key];
          if (action && (action !== "paste" || clipboard)) {
            event.preventDefault();
            runMenuAction(action, menuItem);
            return;
          }
        }
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        handleNewFolder(currentPath);
      } else if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        onNewBuild();
      } else if (event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        handleCopy(selectedItem);
      } else if (event.ctrlKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        handleCut(selectedItem);
      } else if (event.ctrlKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void handlePaste(currentPath);
      } else if (event.key === "F2") {
        event.preventDefault();
        handleRename(selectedItem);
      } else if (event.key === "Delete") {
        event.preventDefault();
        handleDelete(selectedItem);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    confirm,
    clipboard,
    currentPath,
    handleCopy,
    handleCut,
    handleDelete,
    handleNewFolder,
    handlePaste,
    handleRename,
    onNewBuild,
    prompt,
    menuItem,
    runMenuAction,
    selectedItem,
  ]);

  useEffect(() => {
    if (!menuItem) return;
    const close = () => setMenuItem(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuItem]);

  const renderMeta = (entry: BuildEntry): string => {
    if (entry.level === undefined && !entry.className) return "";
    return t("buildList.meta.level", {
      level: entry.level ?? "?",
      ascendancy:
        entry.ascendClassName ||
        entry.className ||
        t("buildList.meta.unknownClass"),
    });
  };

  const renderActions = (item: SidebarItemRef): React.ReactNode => (
    <div
      className="pob-row-actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="pob-more-btn"
        onClick={(event) => {
          event.stopPropagation();
          setMenuItem((prev) => (isSameItem(prev, item) ? null : item));
        }}
        title={t("sidebar.actions")}
      >
        &#8230;
      </button>
      {isSameItem(menuItem, item) && (
        <div className="pob-action-menu">
          {item.kind === "folder" && (
            <>
              <MenuItem
                icon="new-folder"
                label={t("buildList.toolbar.newFolder")}
                shortcut="N"
                onSelect={() => runMenuAction("newFolder", item)}
              />
              {clipboard && (
                <MenuItem
                  icon="paste"
                  label={t("buildList.toolbar.paste")}
                  shortcut="P"
                  onSelect={() => runMenuAction("paste", item)}
                />
              )}
            </>
          )}
          {item.kind === "file" && (
            <>
              <MenuItem
                icon="copy"
                label={t("buildList.toolbar.copy")}
                shortcut="C"
                onSelect={() => runMenuAction("copy", item)}
              />
              <MenuItem
                icon="cut"
                label={t("buildList.toolbar.cut")}
                shortcut="X"
                onSelect={() => runMenuAction("cut", item)}
              />
            </>
          )}
          <MenuItem
            icon="rename"
            label={t("buildList.toolbar.rename")}
            shortcut="R"
            onSelect={() => runMenuAction("rename", item)}
          />
          <MenuItem
            danger
            icon="delete"
            label={t("buildList.toolbar.delete")}
            shortcut="D"
            onSelect={() => runMenuAction("delete", item)}
          />
        </div>
      )}
    </div>
  );

  const setClampedMainSkillHeight = useCallback(
    (height: number) => {
      setMainSkillPanelHeight(
        clampMainSkillSummaryHeight(height, mainSkillPanelMaxHeight),
      );
    },
    [mainSkillPanelMaxHeight],
  );

  const handleMainSkillResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mainSkillCollapsed) return;
      event.preventDefault();
      mainSkillResizeRef.current = {
        startY: event.clientY,
        startHeight: mainSkillPanelHeight,
      };

      const handleMove = (moveEvent: MouseEvent) => {
        const resize = mainSkillResizeRef.current;
        if (!resize) return;
        setClampedMainSkillHeight(
          resize.startHeight - (moveEvent.clientY - resize.startY),
        );
      };

      const handleUp = () => {
        mainSkillResizeRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [mainSkillCollapsed, mainSkillPanelHeight, setClampedMainSkillHeight],
  );

  const handleMainSkillResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (mainSkillCollapsed) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setClampedMainSkillHeight(mainSkillPanelHeight + 16);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setClampedMainSkillHeight(mainSkillPanelHeight - 16);
      } else if (event.key === "Home") {
        event.preventDefault();
        setClampedMainSkillHeight(MAIN_SKILL_SUMMARY_MIN_HEIGHT);
      } else if (event.key === "End") {
        event.preventDefault();
        setClampedMainSkillHeight(mainSkillPanelMaxHeight);
      }
    },
    [
      mainSkillCollapsed,
      mainSkillPanelHeight,
      mainSkillPanelMaxHeight,
      setClampedMainSkillHeight,
    ],
  );

  const renderMainSkillSummary = (): React.ReactNode => {
    if (mainSkillSummary.status === "idle") {
      return (
        <p className="pob-sidebar-main-skill-status">
          {t("sidebar.mainSkillSummary.empty")}
        </p>
      );
    }

    if (mainSkillSummary.status === "loading") {
      return (
        <p className="pob-sidebar-main-skill-status">
          {t("sidebar.mainSkillSummary.loading")}
        </p>
      );
    }

    if (mainSkillSummary.status === "error") {
      return (
        <p className="pob-sidebar-main-skill-status is-error">
          {t("buildList.error.generic", { reason: mainSkillSummary.reason })}
        </p>
      );
    }

    const rows = buildMainSkillSummaryRows(mainSkillSummary.snapshot);
    if (rows.length === 0 && mainSkillSummary.snapshot.warnings.length === 0) {
      return (
        <p className="pob-sidebar-main-skill-status">
          {t("sidebar.mainSkillSummary.empty")}
        </p>
      );
    }

    return (
      <>
        {rows.length > 0 && (
          <div className="pob-sidebar-main-skill-rows">
            {rows.map((row) =>
              row.kind === "spacer" ? (
                <div
                  key={row.id}
                  className="pob-sidebar-main-skill-spacer"
                  aria-hidden="true"
                />
              ) : row.kind === "text" ? (
                <div key={row.id} className="pob-sidebar-main-skill-text">
                  {row.text}
                </div>
              ) : (
                <div key={row.id} className="pob-sidebar-main-skill-row">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ),
            )}
          </div>
        )}
        {mainSkillSummary.snapshot.warnings.length > 0 && (
          <ul className="pob-sidebar-main-skill-warnings">
            {mainSkillSummary.snapshot.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        )}
      </>
    );
  };

  const renderTreeNode = (subPath: string, depth: number): React.ReactNode => {
    const rootLabel = t("buildList.breadcrumb.root");
    const entries = getVisibleEntries(subPath);
    const isExpanded = expandedPaths.has(subPath);
    const isCurrent = currentPath === subPath && selectedFile === null;
    const isLoading = loadingPaths.has(subPath);
    const isRoot = subPath === "";
    const folderName = getFolderName(subPath, rootLabel);
    const folderItem: SidebarItemRef | null = isRoot
      ? null
      : {
          kind: "folder",
          subPath: getParentSubPath(subPath),
          name: folderName,
        };
    const canDrop = canDropOnFolder(subPath);
    const isDropTarget = canDrop && dropTargetPath === subPath;
    const folderOpen = isRoot || isExpanded;

    return (
      <React.Fragment key={subPath || "root"}>
        <div
          className={
            "pob-tree-row" +
            (isCurrent ? " selected" : "") +
            (isDropTarget ? " drop-target" : "")
          }
          style={{ paddingLeft: 10 + depth * 8 }}
          draggable={!isRoot}
          onDragStart={(event) => {
            if (!folderItem) return;
            setDragItem(folderItem);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragItem(null);
            setDropTargetPath(null);
          }}
          onDragOver={(event) => {
            if (!canDropOnFolder(subPath)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetPath(subPath);
          }}
          onDragLeave={() => {
            if (dropTargetPath === subPath) setDropTargetPath(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            void handleDropOnFolder(subPath);
          }}
        >
          <button
            type="button"
            className="pob-tree-label pob-folder-label"
            onClick={() => {
              if (!isRoot) handleToggleFolder(subPath);
              if (!isCurrent) handleSelectFolder(subPath);
            }}
            title={folderOpen ? t("sidebar.collapse") : t("sidebar.expand")}
          >
            <span
              className={
                "pob-tree-icon pob-icon-folder" + (folderOpen ? " open" : "")
              }
              aria-hidden="true"
            />
            <span className="pob-tree-name">
              {folderName}
              {isLoading ? "..." : ""}
            </span>
          </button>
          {!isRoot && folderItem && renderActions(folderItem)}
        </div>
        {isExpanded && entries.length > 0 && (
          <div
            className="pob-tree-children"
            style={
              {
                "--pob-tree-guide-left": `${18 + depth * 8}px`,
              } as React.CSSProperties
            }
          >
            {entries.map((entry) => {
              if (entry.kind === "folder") {
                return renderTreeNode(
                  joinSubPath(subPath, entry.name),
                  depth + 1,
                );
              }

              const item: SidebarItemRef = {
                kind: "file",
                subPath,
                name: entry.name,
              };
              const selected =
                selectedItem?.kind === "file" &&
                selectedItem.subPath === subPath &&
                selectedItem.name === entry.name;
              return (
                <div
                  key={`${subPath}:file:${entry.name}`}
                  className={
                    "pob-tree-row pob-build-row" + (selected ? " selected" : "")
                  }
                  style={{ paddingLeft: 12 + depth * 8 }}
                  draggable
                  onClick={() => handleSelectFile(subPath, entry)}
                  onDragStart={(event) => {
                    setDragItem(item);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragItem(null);
                    setDropTargetPath(null);
                  }}
                >
                  <button className="pob-tree-label pob-build-label">
                    <span
                      className="pob-tree-icon pob-icon-document"
                      aria-hidden="true"
                    />
                    <span className="pob-build-copy">
                      <span className="pob-tree-name">{entry.name}</span>
                      <span className="pob-tree-meta">{renderMeta(entry)}</span>
                    </span>
                  </button>
                  {renderActions(item)}
                </div>
              );
            })}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <aside
      className={"pob-sidebar" + (collapsed ? " collapsed" : "")}
      aria-label={t("sidebar.label")}
    >
      {collapsed ? (
        <div className="pob-sidebar-rail">
          <div className="pob-sidebar-rail-top">
            <button
              type="button"
              className="pob-rail-button"
              onClick={onToggleCollapse}
              title={t("sidebar.expand")}
            >
              <span className="pob-rail-icon panel" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pob-rail-button"
              onClick={onNewBuild}
              title={t("sidebar.newBuild")}
            >
              <span className="pob-rail-icon plus" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pob-rail-button"
              onClick={onToggleCollapse}
              title={t("sidebar.search.placeholder")}
            >
              <span className="pob-rail-icon search" aria-hidden="true" />
            </button>
          </div>
          <div className="pob-sidebar-rail-bottom">
            <button
              type="button"
              className={"pob-rail-button" + (autosave ? " active" : "")}
              onClick={() => onAutosaveChange(!autosave)}
              title={t("sidebar.autosave")}
            >
              <span className="pob-rail-icon autosave" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pob-sidebar-top">
            <div className="pob-sidebar-title-row">
              <strong className="pob-sidebar-title">
                {t("sidebar.title")}
              </strong>
              <button
                type="button"
                className="pob-sidebar-toggle"
                onClick={onToggleCollapse}
                title={t("sidebar.collapse")}
              >
                <span className="pob-rail-icon panel" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="pob-btn pob-sidebar-new"
              onClick={onNewBuild}
            >
              <span className="pob-rail-icon plus" aria-hidden="true" />
              <span>{t("sidebar.newBuild")}</span>
            </button>
            <label className="pob-sidebar-search-wrap">
              <span className="pob-rail-icon search" aria-hidden="true" />
              <input
                className="pob-sidebar-search"
                type="text"
                placeholder={t("sidebar.search.placeholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {error && <div className="pob-error">{error}</div>}

          <div className="pob-sidebar-body">
            <div className="pob-tree">{renderTreeNode("", 0)}</div>
          </div>

          {!mainSkillCollapsed && (
            <div
              className="pob-sidebar-main-skill-resizer"
              role="separator"
              aria-label={t("sidebar.mainSkillSummary.resize")}
              aria-orientation="horizontal"
              aria-valuemin={MAIN_SKILL_SUMMARY_MIN_HEIGHT}
              aria-valuemax={mainSkillPanelMaxHeight}
              aria-valuenow={mainSkillPanelHeight}
              tabIndex={0}
              onMouseDown={handleMainSkillResizeStart}
              onKeyDown={handleMainSkillResizeKeyDown}
            />
          )}

          <section
            className={
              "pob-sidebar-main-skill" +
              (mainSkillCollapsed ? " is-collapsed" : "")
            }
            aria-label={t("sidebar.mainSkillSummary.title")}
            style={
              mainSkillCollapsed ? undefined : { height: mainSkillPanelHeight }
            }
          >
            <header className="pob-sidebar-main-skill-header">
              <span className="pob-rail-icon panel" aria-hidden="true" />
              <strong>
                {mainSkillSummary.status === "ready"
                  ? getMainSkillSummaryTitle(
                      mainSkillSummary.snapshot,
                      t("sidebar.mainSkillSummary.title"),
                    )
                  : t("sidebar.mainSkillSummary.title")}
              </strong>
              <button
                type="button"
                className="pob-sidebar-main-skill-toggle"
                aria-expanded={!mainSkillCollapsed}
                onClick={() => setMainSkillCollapsed((value) => !value)}
                title={t(
                  mainSkillCollapsed
                    ? "sidebar.mainSkillSummary.expand"
                    : "sidebar.mainSkillSummary.collapse",
                )}
              >
                <span
                  className={
                    "pob-rail-icon " +
                    (mainSkillCollapsed ? "chevron-up" : "chevron-down")
                  }
                  aria-hidden="true"
                />
              </button>
            </header>
            {!mainSkillCollapsed && (
              <div className="pob-sidebar-main-skill-body">
                {renderMainSkillSummary()}
              </div>
            )}
          </section>

          <div className="pob-sidebar-bottom">
            <label className="pob-check">
              <input
                type="checkbox"
                checked={autosave}
                onChange={(event) => onAutosaveChange(event.target.checked)}
              />
              {t("sidebar.autosave")}
            </label>
            <label className="pob-sort pob-sidebar-sort">
              {t("buildList.toolbar.sort")}
              <select
                value={sortKey}
                onChange={(event) =>
                  onSortChange(event.target.value as SortKey)
                }
              >
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`buildList.sort.${key}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

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
    </aside>
  );
};

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="pob-modal-overlay" onClick={onClose}>
    <div className="pob-modal" onClick={(event) => event.stopPropagation()}>
      <h3>{title}</h3>
      {children}
    </div>
  </div>
);

const MenuItem: React.FC<{
  danger?: boolean;
  icon: string;
  label: string;
  shortcut: string;
  onSelect: () => void;
}> = ({ danger = false, icon, label, shortcut, onSelect }) => (
  <button
    className={"pob-action-menu-item" + (danger ? " danger" : "")}
    onClick={(event) => {
      event.stopPropagation();
      onSelect();
    }}
  >
    <span className={`pob-menu-icon ${icon}`} aria-hidden="true" />
    <span className="pob-action-menu-label">{label}</span>
    <span className="pob-action-menu-shortcut">{shortcut}</span>
  </button>
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
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label>{label}</label>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
