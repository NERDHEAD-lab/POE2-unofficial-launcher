import type { PobItemSlot, PobItemSummary } from "@poe2-launcher/shared/types";

export function isVisibleItemSlot(slot: PobItemSlot): boolean {
  return slot.visible;
}

export function canInspectSlotItem(
  item: PobItemSummary | null | undefined,
): item is PobItemSummary {
  return item != null;
}
