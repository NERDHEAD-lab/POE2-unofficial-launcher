const ITEM_COPY_HEADERS = [
  /^Item Class:\s+/m,
  /^Rarity:\s+\S+/m,
  /^아이템 종류:\s+/m,
  /^아이템 희귀도:\s+/m,
] as const;

export const readItemCopyTextFromClipboard = (text: string): string | null => {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;
  return ITEM_COPY_HEADERS.some((pattern) => pattern.test(normalized))
    ? normalized
    : null;
};

export const isEditablePasteTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea"
  );
};
