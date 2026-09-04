import { useId } from "react";

import {
  STASH_LINKS,
  TWITCH_LINKS,
  isPromotionActive,
  promotionScheduleKey,
  promotionTitle,
  promotionMatchesTarget,
  type PromotionEvent,
} from "../../shared/promotions";
import {
  formatStashEstimate,
  type StashEstimate,
} from "../../shared/stash-sales";
import { usePromotionSchedule } from "../hooks/usePromotions";

import type { ActiveGame, ServiceChannel } from "../../shared/types";

import "./PromotionStatus.css";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const period = (event: PromotionEvent) =>
  `${dateTime.format(new Date(event.startsAt))} ~ ${dateTime.format(new Date(event.endsAt))}`;

function BuffIcon({ kind }: { kind: PromotionEvent["kind"] }) {
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

function EventBuff({
  kind,
  events,
  href,
  destination,
  nextEvent,
  estimate,
}: {
  kind: PromotionEvent["kind"];
  events: PromotionEvent[];
  href: string | undefined;
  destination: string;
  nextEvent?: PromotionEvent;
  estimate?: StashEstimate | null;
}) {
  const tooltipId = useId();
  const label = kind === "twitch-drops" ? "트위치 드롭스" : "보관함 할인";
  const active = events.length > 0;
  const icon = (
    <span className={`promotion-buff ${active ? "active" : ""}`}>
      <BuffIcon kind={kind} />
    </span>
  );
  return (
    <span className="promotion-buff-slot" data-promotion-status={kind}>
      {active && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${label} 진행 중 · ${destination}`}
          aria-describedby={tooltipId}
        >
          {icon}
        </a>
      ) : (
        <span
          tabIndex={0}
          role="img"
          aria-label={`${label}: ${nextEvent ? "다음 이벤트 예정" : estimate ? "다음 예상 일정" : "예정된 일정이 없습니다"}`}
          aria-describedby={tooltipId}
        >
          {icon}
        </span>
      )}
      <span className="promotion-buff-tooltip" id={tooltipId} role="tooltip">
        {active ? (
          <>
            {events.map((event) => (
              <span
                className="promotion-buff-period"
                key={promotionScheduleKey(event)}
              >
                <strong>{promotionTitle(event)}</strong>
                <span>{period(event)}</span>
              </span>
            ))}
            <span className="promotion-buff-destination">{destination}</span>
          </>
        ) : nextEvent ? (
          <>
            <span className="promotion-buff-next">다음 이벤트</span>
            <span className="promotion-buff-period">
              <strong>{promotionTitle(nextEvent)}</strong>
              <span>{period(nextEvent)}</span>
            </span>
          </>
        ) : estimate ? (
          <>
            <span className="promotion-buff-next">다음 예상 일정</span>
            <span className="promotion-buff-period">
              <strong>{label}</strong>
              <span>{formatStashEstimate(estimate)} (한국시간)</span>
            </span>
          </>
        ) : (
          <>
            <strong>{label}</strong>
            <span>예정된 일정이 없습니다</span>
          </>
        )}
      </span>
    </span>
  );
}

export default function PromotionStatus({
  activeGame,
  serviceChannel,
}: {
  activeGame: ActiveGame;
  serviceChannel: ServiceChannel;
}) {
  const { events: schedules, stashEstimate } = usePromotionSchedule();
  const events = schedules.filter((event) => isPromotionActive(event));
  const upcoming = schedules
    .filter((event) => !isPromotionActive(event))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const game = activeGame === "POE1" ? "poe1" : "poe2";
  const drops = events.filter((event) => event.kind === "twitch-drops");
  const dropTarget = drops.find((event) => event.game === game) ?? drops[0];
  const stash = events.filter(
    (event) =>
      event.kind === "stash-sale" &&
      promotionMatchesTarget(
        event,
        serviceChannel === "GGG" ? "GGG" : "KakaoGames",
        activeGame === "POE1" ? "POE" : "POE2",
      ) &&
      (event.game === "both" || event.game === game),
  );
  const shop =
    STASH_LINKS[serviceChannel === "GGG" ? 0 : 1].games[
      activeGame === "POE1" ? 0 : 1
    ];
  return (
    <div
      className="promotion-status"
      role="group"
      aria-label="이달의 주요 소식"
    >
      <span className="news-open-mode-label">이달의 주요 소식</span>
      <EventBuff
        kind="twitch-drops"
        events={drops}
        nextEvent={upcoming.find((event) => event.kind === "twitch-drops")}
        href={
          dropTarget
            ? TWITCH_LINKS[dropTarget.game === "poe1" ? "POE1" : "POE2"]
            : undefined
        }
        destination={`PoE ${dropTarget?.game === "poe1" ? "1" : "2"} Twitch`}
      />
      <EventBuff
        kind="stash-sale"
        events={stash}
        estimate={stashEstimate}
        nextEvent={upcoming.find(
          (event) =>
            event.kind === "stash-sale" &&
            promotionMatchesTarget(
              event,
              serviceChannel === "GGG" ? "GGG" : "KakaoGames",
              activeGame === "POE1" ? "POE" : "POE2",
            ) &&
            (event.game === "both" || event.game === game),
        )}
        href={shop.url}
        destination={`${serviceChannel === "GGG" ? "GGG" : "KakaoGames"} ${activeGame === "POE1" ? "POE" : "POE2"} 상점`}
      />
    </div>
  );
}
