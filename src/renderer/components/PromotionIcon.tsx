import type { PromotionEvent } from "../../shared/promotions";

export default function PromotionIcon({
  kind,
}: {
  kind: PromotionEvent["kind"];
}) {
  return kind === "twitch-drops" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 2 1 5v15h5v3l4-3h5l7-7V2H4zm16 10-4 4h-5l-3 3v-3H4V4h16v8z"
      />
      <path fill="currentColor" d="M10 6h2v6h-2zm5 0h2v6h-2z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 7 9-4 9 4v12l-9 3-9-3V7Zm0 0 9 4 9-4M12 11v11M7.5 5l9 4v5l-3 1" />
    </svg>
  );
}
