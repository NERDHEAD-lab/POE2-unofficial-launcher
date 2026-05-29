import type { PobPassivePointBudget } from "@poe2-launcher/shared/types";

import { buildPassivePointBudgetDisplayItems } from "./buildMetadataControls";

interface PassivePointBudgetProps {
  budget: PobPassivePointBudget;
  t: (key: string) => string;
}

export function PassivePointBudget({ budget, t }: PassivePointBudgetProps) {
  const items = buildPassivePointBudgetDisplayItems(budget);
  const ariaLabel = [
    t("buildEdit.passivePointBudget.label"),
    ...items.map(
      (item) =>
        `${t(`buildEdit.passivePointBudget.${item.id}`)} ${item.bucket.used} / ${item.bucket.max}`,
    ),
  ].join(", ");

  return (
    <div
      className="pob-passive-point-budget"
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      title={budget.tooltip}
    >
      {items.map((item) => (
        <span
          key={item.id}
          className={`pob-passive-point-budget-item is-${item.tone}`}
          aria-label={`${t(`buildEdit.passivePointBudget.${item.id}`)} ${item.bucket.used} / ${item.bucket.max}`}
        >
          {item.bucket.used} / {item.bucket.max}
        </span>
      ))}
    </div>
  );
}
