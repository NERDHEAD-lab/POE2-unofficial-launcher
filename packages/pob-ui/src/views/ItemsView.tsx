import {
  type CSSProperties,
  type ClipboardEvent,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type {
  PobItemsAction,
  PobItemsDbKey,
  PobItemsSnapshot,
  PobItemsTooltip,
  PobItemsTooltipRequest,
  PobItemDbSummary,
  PobItemSlot,
  PobItemSummary,
  PobRepoeTranslationsSnapshot,
} from "@poe2-launcher/shared/types";

import {
  isEditablePasteTarget,
  readItemCopyTextFromClipboard,
} from "./itemsPaste";
import {
  buildItemDetailEditAction,
  type ItemDetailMode,
} from "./itemsViewDetailMode";
import { canInspectSlotItem, isVisibleItemSlot } from "./itemsViewSlots";
import {
  buildItemTooltipSections,
  computeFloatingItemTooltipPosition,
} from "./itemsViewTooltip";
import { PobTooltipAssetHeader } from "./PobTooltipAssetHeader";
import {
  buildPobTooltipHeaderAssetStyle,
  buildPobTooltipSharedAssetStyle,
  collectPobTooltipHeaderTitleEntries,
} from "./pobTooltipAssetParts";
import {
  createPobAssetUrl,
  getPobTooltipSeparatorAsset,
} from "./pobTooltipAssets";
import {
  shouldSkipHeaderSeparator,
  tooltipHeaderClasses,
  tooltipInfluenceClasses,
  tooltipLineClasses,
  tooltipSeparatorClasses,
} from "./pobTooltipMetadata";
import {
  filterTranslatedItemDbEntryViews,
  type PobItemDbEntrySearchView,
  type PobSearchLabelProjection,
  translateItemDbEntries,
  translateItemTooltip,
  translateItemsSnapshot,
} from "./repoeTranslations";
import { SearchLabelText } from "./SearchLabelText";
import { PobUnimplementedButton } from "./UnimplementedButton";
import { PobErrorBanner } from "../components/PobErrorBanner";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobItemsSnapshot }
  | { status: "error"; reason: string };

type DbState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; entries: PobItemDbSummary[] }
  | { status: "error"; reason: string };

type ActionState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; reason: string };

type CatalogTab = "custom" | PobItemsDbKey;

type SelectedItemRef =
  | { source: "custom"; id: number }
  | { source: "shared"; id: number }
  | { source: "db"; id: string; db: PobItemsDbKey };

interface ItemsViewProps {
  active: boolean;
  preload?: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onMutated: () => void;
  onToast?: (notice: string) => void;
}

const RARITY_KEYS = new Set(["NORMAL", "MAGIC", "RARE", "UNIQUE", "RELIC"]);

const formatRarity = (t: (key: string) => string, rarity: string): string => {
  if (RARITY_KEYS.has(rarity)) {
    return t(`buildEdit.items.rarity.${rarity}`);
  }
  return rarity;
};

const rarityClass = (rarity: string): string => {
  if (rarity === "UNIQUE") return "is-unique";
  if (rarity === "RELIC") return "is-relic";
  if (rarity === "RARE") return "is-rare";
  if (rarity === "MAGIC") return "is-magic";
  return "is-normal";
};

const plainSearchProjection = (label: string): PobSearchLabelProjection => ({
  localizedLabel: label,
  sourceEnglishLabel: null,
  showSourceEnglish: false,
  localizedHighlightRanges: [],
  sourceEnglishHighlightRanges: [],
  matchedField: null,
});

const isSameSelection = (
  selectedItemRef: SelectedItemRef | null,
  source: SelectedItemRef["source"],
  id: number | string,
  db?: PobItemsDbKey,
): boolean => {
  if (selectedItemRef?.source !== source || selectedItemRef.id !== id) {
    return false;
  }
  if (source === "db") {
    return selectedItemRef.source === "db" && selectedItemRef.db === db;
  }
  return true;
};

type ItemTooltipState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      tooltip: PobItemsTooltip;
      vaultPath: string | null;
      requestKey?: string;
    }
  | { status: "error"; reason: string; requestKey?: string };

const toTooltipRequest = (
  ref: SelectedItemRef,
  slotName?: string | null,
): PobItemsTooltipRequest => ({
  source: ref.source,
  itemId: ref.id,
  db: ref.source === "db" ? ref.db : null,
  slotName: slotName ?? null,
});

function RichItemTooltip({
  tooltip,
  vaultPath,
  floating = false,
  style,
}: {
  tooltip: PobItemsTooltip;
  vaultPath?: string | null;
  floating?: boolean;
  style?: CSSProperties;
}) {
  if (tooltip.lines.length === 0) return null;
  const skippedHeaderSeparatorIndex = tooltip.lines.findIndex(
    (line) =>
      line.kind === "separator" &&
      shouldSkipHeaderSeparator(line.separatorTheme ?? tooltip.header),
  );
  const headerAssetStyle = buildPobTooltipHeaderAssetStyle(
    vaultPath,
    tooltip.header,
  );
  const sharedAssetStyle = buildPobTooltipSharedAssetStyle(vaultPath);
  const headerTitleEntries = collectPobTooltipHeaderTitleEntries(
    tooltip.lines,
    Boolean(headerAssetStyle),
  );
  const headerTitleIndexes = new Set(
    headerTitleEntries.map((entry) => entry.index),
  );
  const tooltipStyle = {
    ...(tooltip.maxWidth
      ? { ["--pob-item-tooltip-max-width"]: `${tooltip.maxWidth}px` }
      : {}),
    ...(sharedAssetStyle ?? {}),
    ...(headerAssetStyle ?? {}),
    ...style,
  } as CSSProperties;
  return (
    <div
      className={tooltipHeaderClasses(
        `pob-item-tooltip ${rarityClass(tooltip.header ?? "NORMAL")}${
          floating ? " is-floating" : ""
        }${headerAssetStyle ? " has-asset-tooltip-header" : ""}`,
        tooltip.header,
      )}
      role={floating ? "tooltip" : undefined}
      style={tooltipStyle}
    >
      {tooltip.header && headerAssetStyle && (
        <PobTooltipAssetHeader
          className="pob-item-tooltip-rarity"
          lineBaseClass="pob-item-tooltip-line"
          titleEntries={headerTitleEntries}
          style={headerAssetStyle}
        >
          {tooltip.influenceHeader1 && (
            <span
              className={tooltipInfluenceClasses(
                "pob-item-tooltip-influence",
                tooltip.influenceHeader1,
                "left",
              )}
            />
          )}
          {tooltip.influenceHeader2 && (
            <span
              className={tooltipInfluenceClasses(
                "pob-item-tooltip-influence",
                tooltip.influenceHeader2,
                "right",
              )}
            />
          )}
        </PobTooltipAssetHeader>
      )}
      {tooltip.header && !headerAssetStyle && (
        <div className="pob-item-tooltip-rarity">
          {tooltip.influenceHeader1 && (
            <span
              className={tooltipInfluenceClasses(
                "pob-item-tooltip-influence",
                tooltip.influenceHeader1,
                "left",
              )}
            />
          )}
          {tooltip.influenceHeader2 && (
            <span
              className={tooltipInfluenceClasses(
                "pob-item-tooltip-influence",
                tooltip.influenceHeader2,
                "right",
              )}
            />
          )}
        </div>
      )}
      <section>
        {tooltip.lines.map((line, index) => {
          if (line.kind === "separator") {
            if (index === skippedHeaderSeparatorIndex) return null;
            const separatorAsset = getPobTooltipSeparatorAsset(
              line.separatorTheme ?? tooltip.header,
            );
            const separatorAssetUrl = separatorAsset
              ? createPobAssetUrl(vaultPath, separatorAsset)
              : null;
            return (
              <div
                key={`separator-${index}`}
                className={tooltipSeparatorClasses(
                  `pob-item-tooltip-separator${
                    separatorAssetUrl ? " has-asset-separator" : ""
                  }`,
                  line,
                  tooltip.header,
                )}
                style={
                  separatorAssetUrl
                    ? ({
                        ["--pob-tooltip-separator"]: `url("${separatorAssetUrl}")`,
                      } as CSSProperties)
                    : undefined
                }
              />
            );
          }
          if (headerTitleIndexes.has(index)) return null;
          return (
            <div
              key={`line-${index}`}
              className={tooltipLineClasses("pob-item-tooltip-line", line)}
            >
              {line.text}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function ItemsView({
  active,
  preload = false,
  translations,
  onMutated,
  onToast,
}: ItemsViewProps) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedItemRef, setSelectedItemRef] =
    useState<SelectedItemRef | null>(null);
  const [tab, setTab] = useState<CatalogTab>("custom");
  const [dbState, setDbState] = useState<DbState>({ status: "idle" });
  const [actionState, setActionState] = useState<ActionState>({
    status: "idle",
  });
  const [unimplementedNotice, setUnimplementedNotice] = useState<string | null>(
    null,
  );
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customRaw, setCustomRaw] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [detailModeState, setDetailModeState] = useState<{
    key: string;
    mode: ItemDetailMode;
  }>({ key: "", mode: "viewer" });
  const [detailRawState, setDetailRawState] = useState<{
    key: string;
    raw: string;
  }>({ key: "", raw: "" });
  const loadedSnapshotRef = useRef(false);
  const itemCopyLocaleHint = i18n.resolvedLanguage === "en" ? "en" : "ko";
  const showUnimplementedNotice = useCallback(
    (notice: string) => {
      if (onToast) {
        onToast(notice);
        return;
      }
      setUnimplementedNotice(notice);
    },
    [onToast],
  );

  useEffect(() => {
    if (!active && !preload) return;
    if (loadedSnapshotRef.current) return;
    let cancelled = false;
    const fetchSnapshot = async () => {
      const api = window.pobAPI;
      if (!api) {
        if (!cancelled) {
          setState({ status: "error", reason: "pobAPI unavailable" });
        }
        return;
      }
      setState({ status: "loading" });
      const result = await api.session.itemsSnapshot();
      if (cancelled) return;
      if (result.status === "ok") {
        loadedSnapshotRef.current = true;
        setState({ status: "ready", snapshot: result.snapshot });
      } else {
        setState({ status: "error", reason: result.reason });
      }
    };
    void fetchSnapshot();
    return () => {
      cancelled = true;
    };
  }, [active, preload]);

  useEffect(() => {
    if ((!active && !preload) || tab === "custom") return;
    let cancelled = false;
    const fetchDb = async () => {
      const api = window.pobAPI;
      if (!api) {
        if (!cancelled) {
          setDbState({ status: "error", reason: "pobAPI unavailable" });
        }
        return;
      }
      setDbState({ status: "loading" });
      const result = await api.session.itemsDbList(tab);
      if (cancelled) return;
      if (result.status === "ok") {
        setDbState({ status: "ready", entries: result.list.entries });
      } else {
        setDbState({ status: "error", reason: result.reason });
      }
    };
    void fetchDb();
    return () => {
      cancelled = true;
    };
  }, [active, preload, tab]);

  const sourceSnapshot = state.status === "ready" ? state.snapshot : null;
  const snapshot = useMemo(
    () =>
      sourceSnapshot
        ? translateItemsSnapshot(sourceSnapshot, translations)
        : null,
    [sourceSnapshot, translations],
  );
  const dbEntries = useMemo(
    () =>
      dbState.status === "ready"
        ? translateItemDbEntries(dbState.entries, translations)
        : null,
    [dbState, translations],
  );
  const filteredDbEntryViews = useMemo(
    () =>
      dbState.status === "ready" && dbEntries
        ? filterTranslatedItemDbEntryViews(
            dbEntries,
            dbState.entries,
            dbSearch,
            translations.locale,
          )
        : null,
    [dbEntries, dbSearch, dbState, translations.locale],
  );
  const filteredDbEntries = useMemo(
    () => filteredDbEntryViews?.map((view) => view.entry) ?? dbEntries,
    [dbEntries, filteredDbEntryViews],
  );
  const busy = actionState.status === "running";

  const itemsById = useMemo(() => {
    const map = new Map<number, PobItemSummary>();
    if (snapshot) {
      for (const item of snapshot.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [snapshot]);

  const selectedItem = useMemo(() => {
    if (selectedItemRef === null) return null;
    if (selectedItemRef.source === "custom") {
      return itemsById.get(selectedItemRef.id) ?? null;
    }
    if (selectedItemRef.source === "shared") {
      return (
        snapshot?.sharedItems.find((item) => item.id === selectedItemRef.id) ??
        null
      );
    }
    if (filteredDbEntries && selectedItemRef.db === tab) {
      return (
        filteredDbEntries.find((item) => item.id === selectedItemRef.id) ?? null
      );
    }
    return null;
  }, [filteredDbEntries, itemsById, selectedItemRef, snapshot, tab]);

  const selectedItemKey = selectedItemRef
    ? selectedItemRef.source === "db"
      ? `db:${selectedItemRef.db}:${selectedItemRef.id}`
      : `${selectedItemRef.source}:${String(selectedItemRef.id)}`
    : "";
  const detailMode =
    detailModeState.key === selectedItemKey ? detailModeState.mode : "viewer";
  const detailRaw =
    detailRawState.key === selectedItemKey
      ? detailRawState.raw
      : (selectedItem?.raw ?? "");

  const runAction = async (action: PobItemsAction): Promise<void> => {
    const api = window.pobAPI;
    setUnimplementedNotice(null);
    if (!api) {
      setActionState({ status: "error", reason: "pobAPI unavailable" });
      return;
    }

    setActionState({ status: "running" });
    const result = await api.session.itemsAction(action);
    if (result.status === "ok") {
      setState({ status: "ready", snapshot: result.snapshot });
      setActionState({ status: "idle" });
      onMutated();
    } else {
      setActionState({ status: "error", reason: result.reason });
    }
  };

  const runParseAndAdd = useCallback(
    async (rawText: string, equip = false): Promise<boolean> => {
      const api = window.pobAPI;
      if (!api) {
        setActionState({ status: "error", reason: "pobAPI unavailable" });
        return false;
      }

      setActionState({ status: "running" });
      const result = await api.session.itemsParseAndAdd({
        rawText,
        equip,
        localeHint: itemCopyLocaleHint,
      });
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        setActionState({ status: "idle" });
        onMutated();
        return true;
      }

      setActionState({ status: "error", reason: result.reason });
      return false;
    },
    [itemCopyLocaleHint, onMutated],
  );

  const handleItemsPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>): void => {
      if (busy || isEditablePasteTarget(event.target)) return;
      const rawText = readItemCopyTextFromClipboard(
        event.clipboardData.getData("text/plain"),
      );
      if (!rawText) return;

      event.preventDefault();
      void runParseAndAdd(rawText);
    },
    [busy, runParseAndAdd],
  );

  const selectedCustomId =
    selectedItemRef?.source === "custom" ? selectedItemRef.id : null;
  const selectedSharedIndex =
    selectedItemRef?.source === "shared" ? selectedItemRef.id : null;

  if (state.status === "error") {
    return (
      <PobErrorBanner
        message={t("buildList.error.generic", { reason: state.reason })}
        source="Items"
      />
    );
  }

  if (state.status === "idle" || state.status === "loading" || !snapshot) {
    return (
      <p className="pob-mode-placeholder-body">
        {t("buildEdit.items.loading")}
      </p>
    );
  }

  return (
    <div className="pob-items" tabIndex={0} onPaste={handleItemsPaste}>
      <div className="pob-items-toolbar">
        <label className="pob-items-set">
          <span>{t("buildEdit.items.setLabel")}</span>
          <select
            value={snapshot.activeSetId}
            disabled={busy || snapshot.sets.length <= 1}
            onChange={(event) =>
              void runAction({
                type: "setActiveSet",
                setId: Number(event.target.value),
              })
            }
          >
            {snapshot.sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.title || `Set ${set.id}`}
              </option>
            ))}
          </select>
          <PobUnimplementedButton
            className="pob-button"
            controlId="items.set-manage"
            notice={t("buildEdit.unimplemented.notice", {
              reason: t("buildEdit.items.setManageDisabled"),
            })}
            title={t("buildEdit.items.setManageDisabled")}
            onNotice={showUnimplementedNotice}
          >
            {t("buildEdit.items.setManage")}
          </PobUnimplementedButton>
        </label>
        <PobUnimplementedButton
          className="pob-button pob-items-trade"
          controlId="items.price-check"
          notice={t("buildEdit.unimplemented.notice", {
            reason: t("buildEdit.items.priceCheckDisabled"),
          })}
          title={t("buildEdit.items.priceCheckDisabled")}
          onNotice={showUnimplementedNotice}
        >
          {t("buildEdit.items.priceCheck")}
        </PobUnimplementedButton>
        <div
          className="pob-items-weapon-set"
          aria-label={t("buildEdit.items.weaponSet")}
        >
          <span>{t("buildEdit.items.weaponSet")}</span>
          <button
            type="button"
            className={
              "pob-items-weapon-toggle" +
              (!snapshot.useSecondWeaponSet ? " is-active" : "")
            }
            disabled={busy || !snapshot.useSecondWeaponSet}
            onClick={() =>
              void runAction({ type: "setWeaponSet", weaponSet: 1 })
            }
          >
            {t("buildEdit.items.weaponSet1")}
          </button>
          <button
            type="button"
            className={
              "pob-items-weapon-toggle" +
              (snapshot.useSecondWeaponSet ? " is-active" : "")
            }
            disabled={busy || snapshot.useSecondWeaponSet}
            onClick={() =>
              void runAction({ type: "setWeaponSet", weaponSet: 2 })
            }
          >
            {t("buildEdit.items.weaponSet2")}
          </button>
        </div>
      </div>

      {actionState.status === "error" && (
        <PobErrorBanner
          className="pob-items-action-error"
          message={t("buildList.error.generic", {
            reason: actionState.reason,
          })}
          source="Items action"
          dismissible
          onDismiss={() => setActionState({ status: "idle" })}
        />
      )}
      {unimplementedNotice && (
        <div className="pob-items-action-notice" role="status">
          {unimplementedNotice}
        </div>
      )}

      <div className="pob-items-cols">
        <SlotPane
          slots={snapshot.slots}
          itemsById={itemsById}
          selectedItemRef={selectedItemRef}
          busy={busy}
          onSelect={setSelectedItemRef}
          onAction={(action) => void runAction(action)}
        />

        <section
          className="pob-items-catalog"
          aria-label={t("buildEdit.items.itemListHeader", {
            count: snapshot.items.length,
          })}
        >
          {tab === "custom" ? (
            <CustomPane
              items={snapshot.items}
              sharedItems={snapshot.sharedItems}
              selectedItemRef={selectedItemRef}
              selectedCustomId={selectedCustomId}
              selectedSharedIndex={selectedSharedIndex}
              busy={busy}
              translations={translations}
              onSelect={setSelectedItemRef}
              onAction={(action) => void runAction(action)}
              onUnavailable={showUnimplementedNotice}
              onCreateCustom={() => setCustomEditorOpen(true)}
            />
          ) : (
            <DbPane
              dbKey={tab}
              state={dbState}
              entryViews={filteredDbEntryViews}
              formatRarityLabel={(r) => formatRarity(t, r)}
              selectedItemRef={selectedItemRef}
              busy={busy}
              translations={translations}
              search={dbSearch}
              onSearchChange={setDbSearch}
              onSelect={setSelectedItemRef}
              onAction={(action) => void runAction(action)}
            />
          )}

          <nav className="pob-items-catalog-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "custom"}
              className={
                "pob-items-catalog-tab" + (tab === "custom" ? " is-active" : "")
              }
              onClick={() => setTab("custom")}
            >
              {t("buildEdit.items.dbTab.custom")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "uniqueDB"}
              className={
                "pob-items-catalog-tab" +
                (tab === "uniqueDB" ? " is-active" : "")
              }
              onClick={() => setTab("uniqueDB")}
            >
              {t("buildEdit.items.dbTab.unique")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "rareDB"}
              className={
                "pob-items-catalog-tab" + (tab === "rareDB" ? " is-active" : "")
              }
              onClick={() => setTab("rareDB")}
            >
              {t("buildEdit.items.dbTab.rare")}
            </button>
          </nav>
        </section>

        <aside className="pob-items-detail">
          {selectedItem && selectedItemRef ? (
            <ItemDetail
              item={selectedItem}
              itemRef={selectedItemRef}
              mode={detailMode}
              rawValue={detailRaw}
              busy={busy}
              translations={translations}
              onModeChange={(mode) =>
                setDetailModeState({ key: selectedItemKey, mode })
              }
              onRawChange={(raw) =>
                setDetailRawState({ key: selectedItemKey, raw })
              }
              onAction={(action) => void runAction(action)}
            />
          ) : (
            <p className="pob-mode-placeholder-body">
              {t("buildEdit.items.detail.empty")}
            </p>
          )}
          <details className="pob-items-help">
            <summary>
              {t("buildEdit.items.actions.help").slice(0, 24)}...
            </summary>
            <p>{t("buildEdit.items.actions.help")}</p>
          </details>
        </aside>
      </div>

      {customEditorOpen && (
        <div className="pob-items-modal" role="dialog" aria-modal="true">
          <div className="pob-items-modal-panel">
            <h3>{t("buildEdit.items.actions.createCustom")}</h3>
            <label>
              <span>{t("buildEdit.items.customRawLabel")}</span>
              <textarea
                value={customRaw}
                onChange={(event) => setCustomRaw(event.target.value)}
                placeholder={t("buildEdit.items.customRawPlaceholder")}
              />
            </label>
            <div className="pob-items-modal-actions">
              <button
                type="button"
                className="pob-button"
                onClick={() => {
                  setCustomEditorOpen(false);
                  setCustomRaw("");
                }}
              >
                {t("dialog.unsaved.cancel")}
              </button>
              <button
                type="button"
                className="pob-button"
                disabled={busy || !customRaw.trim()}
                onClick={() => {
                  void runParseAndAdd(customRaw).then((ok) => {
                    if (!ok) return;
                    setCustomEditorOpen(false);
                    setCustomRaw("");
                  });
                }}
              >
                {t("buildEdit.items.customCreate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SlotPaneProps {
  slots: PobItemSlot[];
  itemsById: Map<number, PobItemSummary>;
  selectedItemRef: SelectedItemRef | null;
  busy: boolean;
  onSelect: (ref: SelectedItemRef) => void;
  onAction: (action: PobItemsAction) => void;
}

function SlotPane({
  slots,
  itemsById,
  selectedItemRef,
  busy,
  onSelect,
  onAction,
}: SlotPaneProps) {
  const { t } = useTranslation();
  return (
    <div
      className="pob-items-slots"
      aria-label={t("buildEdit.items.slotsHeader")}
    >
      <ul>
        {slots.filter(isVisibleItemSlot).map((slot) => {
          const equipped =
            slot.selItemId > 0 ? itemsById.get(slot.selItemId) : null;
          const validItemIds = new Set([slot.selItemId, ...slot.validItemIds]);
          validItemIds.delete(0);
          return (
            <li
              key={slot.name}
              className={
                "pob-items-slot" +
                (equipped &&
                isSameSelection(selectedItemRef, "custom", equipped.id)
                  ? " is-selected"
                  : "")
              }
            >
              {slot.canActivate ? (
                <input
                  type="checkbox"
                  checked={slot.active}
                  disabled={busy || slot.selItemId === 0}
                  aria-label={t("buildEdit.items.slotActive", {
                    slot: slot.label,
                  })}
                  onChange={(event) =>
                    onAction({
                      type: "setSlotActive",
                      slotName: slot.name,
                      active: event.target.checked,
                    })
                  }
                />
              ) : (
                <span
                  className="pob-items-slot-activate-placeholder"
                  aria-hidden="true"
                />
              )}
              <span className="pob-items-slot-label">{slot.label}</span>
              <select
                value={slot.selItemId}
                disabled={busy}
                onChange={(event) =>
                  onAction({
                    type: "equip",
                    slotName: slot.name,
                    itemId: Number(event.target.value),
                  })
                }
              >
                <option value={0}>{t("buildEdit.items.slotEmpty")}</option>
                {Array.from(validItemIds).map((itemId) => {
                  const item = itemsById.get(itemId);
                  return item ? (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ) : null;
                })}
              </select>
              <button
                type="button"
                className={
                  "pob-items-slot-item" +
                  (equipped ? ` ${rarityClass(equipped.rarity)}` : "")
                }
                disabled={!canInspectSlotItem(equipped)}
                title={t("buildEdit.items.detail.view")}
                aria-label={t("buildEdit.items.detail.view")}
                onClick={() => {
                  if (!equipped) return;
                  onSelect({ source: "custom", id: equipped.id });
                }}
              >
                <span className="pob-rail-icon search" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface CustomPaneProps {
  items: PobItemSummary[];
  sharedItems: PobItemSummary[];
  selectedItemRef: SelectedItemRef | null;
  selectedCustomId: number | null;
  selectedSharedIndex: number | null;
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onSelect: (ref: SelectedItemRef) => void;
  onAction: (action: PobItemsAction) => void;
  onUnavailable: (notice: string) => void;
  onCreateCustom: () => void;
}

function CustomPane({
  items,
  sharedItems,
  selectedItemRef,
  selectedCustomId,
  selectedSharedIndex,
  busy,
  translations,
  onSelect,
  onAction,
  onUnavailable,
  onCreateCustom,
}: CustomPaneProps) {
  const { t } = useTranslation();
  return (
    <div className="pob-items-custom-stack">
      <section className="pob-items-subpane">
        <header className="pob-items-pane-header">
          <div className="pob-items-pane-title">
            <strong>{t("buildEdit.items.allItems")}</strong>
            <span>{items.length}</span>
          </div>
          <div className="pob-items-pane-actions">
            <button
              type="button"
              className="pob-button"
              disabled={busy || items.length === 0}
              onClick={() => onAction({ type: "sortItems" })}
            >
              {t("buildEdit.items.actions.sort")}
            </button>
            <button
              type="button"
              className="pob-button"
              disabled={busy || items.length === 0}
              onClick={() => onAction({ type: "deleteUnused" })}
            >
              {t("buildEdit.items.actions.deleteUnused")}
            </button>
            <button
              type="button"
              className="pob-button"
              disabled={busy || items.length === 0}
              onClick={() => onAction({ type: "deleteAll" })}
            >
              {t("buildEdit.items.actions.deleteAll")}
            </button>
            <button
              type="button"
              className="pob-button"
              disabled={busy || selectedCustomId === null}
              onClick={() =>
                selectedCustomId !== null &&
                onAction({ type: "deleteItem", itemId: selectedCustomId })
              }
            >
              {t("buildEdit.items.actions.delete")}
            </button>
            <span className="pob-items-pane-spacer" />
            <PobUnimplementedButton
              className="pob-button"
              controlId="items.craft"
              notice={t("buildEdit.unimplemented.notice", {
                reason: t("buildEdit.items.craftDisabled"),
              })}
              title={t("buildEdit.items.craftDisabled")}
              onNotice={onUnavailable}
            >
              {t("buildEdit.items.actions.craft")}
            </PobUnimplementedButton>
            <button
              type="button"
              className="pob-button"
              disabled={busy}
              onClick={onCreateCustom}
            >
              {t("buildEdit.items.actions.createCustom")}
            </button>
          </div>
        </header>
        {items.length === 0 ? (
          <p className="pob-mode-placeholder-body">
            {t("buildEdit.items.empty")}
          </p>
        ) : (
          <ItemRows
            items={items}
            selectedItemRef={selectedItemRef}
            source="custom"
            busy={busy}
            translations={translations}
            onSelect={onSelect}
            onAction={onAction}
          />
        )}
      </section>

      <section className="pob-items-subpane pob-items-shared">
        <header className="pob-items-pane-header">
          <div className="pob-items-pane-title">
            <strong>{t("buildEdit.items.shared.title")}</strong>
            <span>{sharedItems.length}</span>
          </div>
          <button
            type="button"
            className="pob-button"
            disabled={busy || selectedSharedIndex === null}
            onClick={() =>
              selectedSharedIndex !== null &&
              onAction({ type: "deleteSharedItem", index: selectedSharedIndex })
            }
          >
            {t("buildEdit.items.shared.delete")}
          </button>
        </header>
        {sharedItems.length === 0 ? (
          <p className="pob-mode-placeholder-body">
            {t("buildEdit.items.shared.help")}
          </p>
        ) : (
          <ItemRows
            items={sharedItems}
            selectedItemRef={selectedItemRef}
            source="shared"
            busy={busy}
            translations={translations}
            onSelect={onSelect}
            onAction={onAction}
          />
        )}
      </section>
    </div>
  );
}

interface DbPaneProps {
  dbKey: PobItemsDbKey;
  state: DbState;
  entryViews: PobItemDbEntrySearchView[] | null;
  formatRarityLabel: (rarity: string) => string;
  selectedItemRef: SelectedItemRef | null;
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (ref: SelectedItemRef) => void;
  onAction: (action: PobItemsAction) => void;
}

function DbPane({
  dbKey,
  state,
  entryViews,
  formatRarityLabel,
  selectedItemRef,
  busy,
  translations,
  search,
  onSearchChange,
  onSelect,
  onAction,
}: DbPaneProps) {
  const { t } = useTranslation();
  return (
    <div className="pob-items-db-pane">
      <header className="pob-items-pane-header pob-items-db-filters">
        <div className="pob-items-db-filter-row">
          <select disabled defaultValue="any">
            <option value="any">{t("buildEdit.items.dbFilter.anySlot")}</option>
          </select>
          <select disabled defaultValue="any">
            <option value="any">{t("buildEdit.items.dbFilter.anyType")}</option>
          </select>
        </div>
        {dbKey === "uniqueDB" && (
          <>
            <div className="pob-items-db-filter-row">
              <select disabled defaultValue="name">
                <option value="name">
                  {t("buildEdit.items.dbFilter.sortName")}
                </option>
              </select>
              <select disabled defaultValue="any">
                <option value="any">
                  {t("buildEdit.items.dbFilter.anyLeague")}
                </option>
              </select>
            </div>
            <div className="pob-items-db-filter-row">
              <select disabled defaultValue="any">
                <option value="any">
                  {t("buildEdit.items.dbFilter.anyReq")}
                </option>
              </select>
              <select disabled defaultValue="obtainable">
                <option value="obtainable">
                  {t("buildEdit.items.dbFilter.obtainable")}
                </option>
              </select>
            </div>
          </>
        )}
        <div className="pob-items-db-filter-row">
          <input
            type="search"
            value={search}
            placeholder={t("buildEdit.items.dbFilter.searchPlaceholder")}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <select disabled defaultValue="anywhere">
            <option value="anywhere">
              {t("buildEdit.items.dbFilter.anywhere")}
            </option>
          </select>
        </div>
      </header>
      <DbList
        dbKey={dbKey}
        state={state}
        entryViews={entryViews}
        formatRarityLabel={formatRarityLabel}
        selectedItemRef={selectedItemRef}
        busy={busy}
        translations={translations}
        onSelect={onSelect}
        onAction={onAction}
      />
    </div>
  );
}

interface ItemRowsProps {
  items: PobItemSummary[];
  selectedItemRef: SelectedItemRef | null;
  source: "custom" | "shared";
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onSelect: (ref: SelectedItemRef) => void;
  onAction: (action: PobItemsAction) => void;
}

interface ItemTooltipButtonProps {
  itemRef: SelectedItemRef;
  item: PobItemSummary | PobItemDbSummary;
  className: string;
  disabled: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: () => void;
  children: ReactNode;
}

function ItemTooltipButton({
  itemRef,
  item,
  className,
  disabled,
  translations,
  onClick,
  onDoubleClick,
  children,
}: ItemTooltipButtonProps) {
  const [tooltipState, setTooltipState] = useState<ItemTooltipState>({
    status: "idle",
  });
  const [tooltipPoint, setTooltipPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const requestId = useRef(0);

  const showTooltip = () => {
    const api = window.pobAPI;
    if (!api) {
      setTooltipState({ status: "error", reason: "pobAPI unavailable" });
      return;
    }
    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;
    setTooltipState({ status: "loading" });
    void api.session
      .itemsTooltip(toTooltipRequest(itemRef))
      .then((result) => {
        if (requestId.current !== nextRequestId) return;
        if (result.status === "ok") {
          setTooltipState({
            status: "ready",
            tooltip: result.tooltip,
            vaultPath: result.vaultPath,
          });
        } else {
          setTooltipState({ status: "error", reason: result.reason });
        }
      })
      .catch((error: unknown) => {
        if (requestId.current !== nextRequestId) return;
        setTooltipState({
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      });
  };

  const hideTooltip = () => {
    requestId.current += 1;
    setTooltipState({ status: "idle" });
    setTooltipPoint(null);
  };

  const updateTooltipPoint = (event: MouseEvent<HTMLElement>) => {
    setTooltipPoint({ x: event.clientX, y: event.clientY });
  };

  const focusTooltipPoint = (event: FocusEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPoint({
      x: rect.right,
      y: rect.top + rect.height / 2,
    });
  };

  const floatingTooltip =
    tooltipState.status === "ready" &&
    tooltipPoint &&
    typeof document !== "undefined"
      ? createPortal(
          <RichItemTooltip
            tooltip={translateItemTooltip(
              tooltipState.tooltip,
              translations,
              item,
            )}
            vaultPath={tooltipState.vaultPath}
            floating
            style={computeFloatingItemTooltipPosition({
              pointerX: tooltipPoint.x,
              pointerY: tooltipPoint.y,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            })}
          />,
          document.body,
        )
      : null;

  return (
    <div
      className="pob-items-tooltip-host"
      onMouseLeave={hideTooltip}
      onMouseMove={updateTooltipPoint}
    >
      <button
        type="button"
        disabled={disabled}
        className={className}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onFocus={(event) => {
          focusTooltipPoint(event);
          showTooltip();
        }}
        onMouseEnter={(event) => {
          updateTooltipPoint(event);
          showTooltip();
        }}
        onBlur={hideTooltip}
      >
        {children}
      </button>
      {floatingTooltip}
    </div>
  );
}

function ItemRows({
  items,
  selectedItemRef,
  source,
  busy,
  translations,
  onSelect,
  onAction,
}: ItemRowsProps) {
  return (
    <ul className="pob-items-list">
      {items.map((item) => (
        <li key={item.id}>
          <ItemTooltipButton
            itemRef={{ source, id: item.id }}
            item={item}
            disabled={busy}
            translations={translations}
            className={
              `pob-items-row ${rarityClass(item.rarity)}` +
              (isSameSelection(selectedItemRef, source, item.id)
                ? " is-selected"
                : "")
            }
            onClick={(event) => {
              if (event.ctrlKey) {
                onAction(
                  source === "custom"
                    ? { type: "equipBest", itemId: item.id }
                    : { type: "addSharedItem", index: item.id, equip: true },
                );
                return;
              }
              onSelect({ source, id: item.id });
            }}
            onDoubleClick={() => {
              if (source === "shared") {
                onAction({
                  type: "addSharedItem",
                  index: item.id,
                  equip: false,
                });
              }
            }}
          >
            <span className="pob-items-row-name">{item.name}</span>
            <span className="pob-items-row-base">
              {item.baseName ?? item.baseType ?? ""}
            </span>
          </ItemTooltipButton>
        </li>
      ))}
    </ul>
  );
}

interface ItemDetailProps {
  item: PobItemSummary | PobItemDbSummary;
  itemRef: SelectedItemRef;
  mode: ItemDetailMode;
  rawValue: string;
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onModeChange: (mode: ItemDetailMode) => void;
  onRawChange: (raw: string) => void;
  onAction: (action: PobItemsAction) => void;
}

function ItemDetail({
  item,
  itemRef,
  mode,
  rawValue,
  busy,
  translations,
  onModeChange,
  onRawChange,
  onAction,
}: ItemDetailProps) {
  const { t } = useTranslation();
  const sections = buildItemTooltipSections(item, {
    baseType: t("buildEdit.items.detail.baseType"),
    itemLevel: t("buildEdit.items.detail.itemLevel"),
    quality: t("buildEdit.items.detail.quality"),
    corrupted: t("buildEdit.items.detail.flag.corrupted"),
    mirrored: t("buildEdit.items.detail.flag.mirrored"),
    shaper: t("buildEdit.items.detail.flag.shaper"),
    elder: t("buildEdit.items.detail.flag.elder"),
    fractured: t("buildEdit.items.detail.flag.fractured"),
  });
  const editAction = buildItemDetailEditAction(
    itemRef.source,
    item.id,
    rawValue,
  );
  const [tooltipState, setTooltipState] = useState<ItemTooltipState>({
    status: "idle",
  });
  const requestId = useRef(0);
  const requestKey =
    itemRef.source === "db"
      ? `${itemRef.source}:${itemRef.db}:${itemRef.id}`
      : `${itemRef.source}:${itemRef.id}`;

  useEffect(() => {
    if (mode !== "viewer") {
      requestId.current += 1;
      return;
    }

    const api = window.pobAPI;
    if (!api) {
      return;
    }

    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;
    void api.session
      .itemsTooltip(toTooltipRequest(itemRef))
      .then((result) => {
        if (requestId.current !== nextRequestId) return;
        if (result.status === "ok") {
          setTooltipState({
            status: "ready",
            tooltip: result.tooltip,
            vaultPath: result.vaultPath,
            requestKey,
          });
        } else {
          setTooltipState({
            status: "error",
            reason: result.reason,
            requestKey,
          });
        }
      })
      .catch((error: unknown) => {
        if (requestId.current !== nextRequestId) return;
        setTooltipState({
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
          requestKey,
        });
      });

    return () => {
      requestId.current += 1;
    };
  }, [itemRef, mode, requestKey]);

  const fallbackTooltip = (
    <div className={`pob-item-tooltip ${rarityClass(item.rarity)}`}>
      <div className="pob-item-tooltip-rarity">
        {formatRarity(t, item.rarity)}
      </div>
      {sections.map((section, sectionIndex) => (
        <section key={section.id} className={`is-${section.id}`}>
          {sectionIndex > 0 && <div className="pob-item-tooltip-separator" />}
          {section.lines.map((line, lineIndex) => (
            <div
              className={`pob-item-tooltip-line is-${line.tone}`}
              key={`${section.id}-${lineIndex}-${line.text}`}
            >
              {line.text}
            </div>
          ))}
        </section>
      ))}
    </div>
  );

  return (
    <>
      <div
        className="pob-items-detail-switch"
        role="tablist"
        aria-label={t("buildEdit.items.detail.modeLabel")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "viewer"}
          className={mode === "viewer" ? "is-active" : ""}
          onClick={() => onModeChange("viewer")}
        >
          {t("buildEdit.items.detail.mode.view")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "editor"}
          className={mode === "editor" ? "is-active" : ""}
          onClick={() => onModeChange("editor")}
        >
          {t("buildEdit.items.detail.mode.edit")}
        </button>
      </div>

      {mode === "viewer" ? (
        tooltipState.status === "ready" &&
        tooltipState.requestKey === requestKey &&
        tooltipState.tooltip.lines.length > 0 ? (
          <RichItemTooltip
            tooltip={translateItemTooltip(
              tooltipState.tooltip,
              translations,
              item,
            )}
            vaultPath={tooltipState.vaultPath}
          />
        ) : (
          fallbackTooltip
        )
      ) : (
        <div className="pob-items-detail-editor">
          <label>
            <span>{t("buildEdit.items.detail.rawLabel")}</span>
            <textarea
              value={rawValue}
              onChange={(event) => onRawChange(event.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="pob-items-detail-editor-actions">
            <button
              type="button"
              className="pob-button"
              onClick={() => {
                onRawChange(item.raw);
                onModeChange("viewer");
              }}
            >
              {t("buildEdit.items.detail.cancel")}
            </button>
            <button
              type="button"
              className="pob-button"
              disabled={busy || !editAction}
              onClick={() => {
                if (editAction) onAction(editAction);
              }}
            >
              {t(
                itemRef.source === "custom"
                  ? "buildEdit.items.detail.save"
                  : "buildEdit.items.detail.addToBuild",
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface DbListProps {
  dbKey: PobItemsDbKey;
  state: DbState;
  entryViews: PobItemDbEntrySearchView[] | null;
  formatRarityLabel: (rarity: string) => string;
  selectedItemRef: SelectedItemRef | null;
  busy: boolean;
  translations: PobRepoeTranslationsSnapshot;
  onSelect: (ref: SelectedItemRef) => void;
  onAction: (action: PobItemsAction) => void;
}

function DbList({
  dbKey,
  state,
  entryViews,
  formatRarityLabel,
  selectedItemRef,
  busy,
  translations,
  onSelect,
  onAction,
}: DbListProps) {
  const { t } = useTranslation();

  if (state.status === "error") {
    return (
      <div className="pob-items-db-state">
        <PobErrorBanner
          message={t("buildList.error.generic", { reason: state.reason })}
          source={`${dbKey} item database`}
        />
      </div>
    );
  }
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="pob-items-db-state">
        <p className="pob-mode-placeholder-body">
          {t("buildEdit.items.dbLoading")}
        </p>
      </div>
    );
  }
  const renderedViews =
    entryViews ??
    (state.status === "ready"
      ? state.entries.map((entry) => ({
          entry,
          sourceEntry: entry,
          name: plainSearchProjection(entry.name),
          base: plainSearchProjection(entry.baseName ?? entry.baseType ?? ""),
        }))
      : []);
  if (renderedViews.length === 0) {
    return (
      <div className="pob-items-db-state">
        <p className="pob-mode-placeholder-body">
          {t("buildEdit.items.dbEmpty")}
        </p>
      </div>
    );
  }
  return (
    <ul className="pob-items-db-list">
      {renderedViews.map((view) => {
        const entry = view.entry;
        const itemRef: SelectedItemRef = {
          source: "db",
          id: entry.id,
          db: dbKey,
        };
        return (
          <li key={entry.id}>
            <ItemTooltipButton
              itemRef={itemRef}
              item={entry}
              disabled={busy}
              translations={translations}
              className={
                `pob-items-db-row ${rarityClass(entry.rarity)}` +
                (isSameSelection(selectedItemRef, "db", entry.id, dbKey)
                  ? " is-selected"
                  : "")
              }
              onClick={(event) => {
                if (event.ctrlKey) {
                  onAction({
                    type: "addDbItem",
                    db: dbKey,
                    itemId: entry.id,
                    equip: true,
                  });
                  return;
                }
                onSelect(itemRef);
              }}
              onDoubleClick={() =>
                onAction({
                  type: "addDbItem",
                  db: dbKey,
                  itemId: entry.id,
                  equip: false,
                })
              }
            >
              <span className="pob-items-db-row-name">
                <SearchLabelText projection={view.name} />
              </span>
              <span className="pob-items-db-row-base">
                <SearchLabelText
                  projection={
                    view.base.localizedLabel
                      ? view.base
                      : plainSearchProjection(formatRarityLabel(entry.rarity))
                  }
                />
              </span>
            </ItemTooltipButton>
          </li>
        );
      })}
    </ul>
  );
}
