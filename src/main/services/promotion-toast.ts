import {
  formatPromotionPeriod,
  promotionActions,
  promotionTitle,
  formatPromotionCountdown,
  type PromotionNotification,
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

export function buildPromotionToast(event: PromotionNotification): string {
  const links = promotionActions(event);
  const launchUrl =
    event.kind === "twitch-drops" || event.targets
      ? (links[0]?.url ?? event.sourceUrl)
      : event.sourceUrl;
  const actions = links
    .map(
      ({ label, url }) =>
        `<action content="${xml(label)}" arguments="${xml(url)}" activationType="protocol"/>`,
    )
    .join("");
  const status =
    event.reminderSeconds === undefined
      ? `진행 중 (${formatPromotionPeriod(event)})`
      : `시작 예정 (${new Date(event.startsAt).toLocaleString()} 시작) · ${formatPromotionCountdown(event.startsAt)}`;
  return `<toast activationType="protocol" launch="${xml(launchUrl)}"><visual><binding template="ToastGeneric"><text>${xml(`${promotionTitle(event)} ${status}`)}</text></binding></visual><actions>${actions}</actions></toast>`;
}
