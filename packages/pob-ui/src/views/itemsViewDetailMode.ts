import type { PobItemsAction } from "@poe2-launcher/shared/types";

export type ItemDetailMode = "viewer" | "editor";
export type ItemDetailSource = "custom" | "shared" | "db";

export const buildItemDetailEditAction = (
  source: ItemDetailSource,
  itemId: number | string,
  raw: string,
): PobItemsAction | null => {
  const trimmedRaw = raw.trim();
  if (!trimmedRaw) return null;
  if (source === "custom") {
    if (typeof itemId !== "number") return null;
    return { type: "saveCustom", itemId, raw };
  }
  return { type: "createCustom", raw, equip: false };
};
