import {
  formatPromotionPeriod,
  promotionActions,
  promotionTitle,
  type PromotionEvent,
} from "../../shared/promotions";

const xml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );

export function buildPromotionToast(event: PromotionEvent): string {
  const links = promotionActions(event);
  const launchUrl = event.targets
    ? (links[0]?.url ?? event.sourceUrl)
    : event.sourceUrl;
  const actions = links
    .map(
      ({ label, url }) =>
        `<action content="${xml(label)}" arguments="${xml(url)}" activationType="protocol"/>`,
    )
    .join("");
  return `<toast activationType="protocol" launch="${xml(launchUrl)}"><visual><binding template="ToastGeneric"><text>${xml(`${promotionTitle(event)} 진행 중 (${formatPromotionPeriod(event)})`)}</text></binding></visual><actions>${actions}</actions></toast>`;
}
