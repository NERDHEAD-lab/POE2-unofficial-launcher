import { useId } from "react";

import PromotionIcon from "./PromotionIcon";
import {
  STASH_LINKS,
  promotionWatchUrl,
  isPromotionActive,
  promotionScheduleKey,
  promotionTitle,
  promotionMatchesTarget,
  formatPromotionCountdown,
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

function promotionGames(event: PromotionEvent, schedules: PromotionEvent[]) {
  if (event.gameUnknown) return "알 수 없음";
  const ownGame = event.game === "poe1" ? "PoE1" : "PoE2";
  const split = /^(ggg-\d+-twitch-[a-f0-9]{10})(?:-(poe1|poe2))?$/.exec(
    event.id,
  );
  if (
    event.sourceGroupId === undefined &&
    (!split || (split[2] && split[2] !== event.game))
  )
    return ownGame;
  const source = (value: string) =>
    value.replace(/\/filter-account-type\/staff$/, "");
  // Only the collector's matching split pair establishes a shared display scope.
  // Notification and schedule identities remain per game.
  const shared = schedules.some(
    (other) =>
      other.game === (event.game === "poe1" ? "poe2" : "poe1") &&
      (event.sourceGroupId !== undefined
        ? other.sourceGroupId === event.sourceGroupId
        : other.sourceGroupId === undefined &&
          split &&
          (other.id === split[1] ||
            other.id === `${split[1]}-${other.game}`)) &&
      !other.gameUnknown &&
      other.kind === event.kind &&
      source(other.sourceUrl) === source(event.sourceUrl) &&
      Date.parse(other.startsAt) === Date.parse(event.startsAt) &&
      Date.parse(other.endsAt) === Date.parse(event.endsAt) &&
      other.title === event.title &&
      other.watchUrl === event.watchUrl,
  );
  return shared ? "PoE1 · PoE2" : ownGame;
}

function EventBuff({
  kind,
  events,
  href,
  destination,
  nextEvent,
  estimate,
  now,
  relatedEvents = [],
}: {
  kind: PromotionEvent["kind"];
  events: PromotionEvent[];
  href: string | undefined;
  destination: string;
  nextEvent?: PromotionEvent;
  estimate?: StashEstimate | null;
  now: number;
  relatedEvents?: PromotionEvent[];
}) {
  const tooltipId = useId();
  const label = kind === "twitch-drops" ? "트위치 드롭스" : "보관함 할인";
  const active = events.length > 0;
  const delta = nextEvent ? Date.parse(nextEvent.startsAt) - now : 0;
  const upcoming = !active && delta > 0 && delta <= 24 * 60 * 60_000;
  const icon = (
    <span
      className={`promotion-buff ${active ? "active" : upcoming ? "upcoming" : ""}`}
    >
      <PromotionIcon kind={kind} />
    </span>
  );
  return (
    <span className="promotion-buff-slot" data-promotion-status={kind}>
      {(active || (kind === "twitch-drops" && upcoming)) && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${label} ${active ? "진행 중" : "시작 예정"} · ${destination}`}
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
                {kind === "twitch-drops" && (
                  <span>적용 게임: {promotionGames(event, relatedEvents)}</span>
                )}
                <span>{period(event)}</span>
                {kind === "twitch-drops" && (
                  <span>
                    {formatPromotionCountdown(event.endsAt, now, "end")}
                  </span>
                )}
              </span>
            ))}
            <span className="promotion-buff-destination">{destination}</span>
          </>
        ) : nextEvent ? (
          <>
            {kind !== "twitch-drops" && (
              <span className="promotion-buff-next">다음 이벤트</span>
            )}
            <span className="promotion-buff-period">
              <strong>{promotionTitle(nextEvent)}</strong>
              {kind === "twitch-drops" && (
                <span>
                  적용 게임: {promotionGames(nextEvent, relatedEvents)}
                </span>
              )}
              <span>{period(nextEvent)}</span>
              <span>{formatPromotionCountdown(nextEvent.startsAt, now)}</span>
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
  const { events: schedules, stashEstimate, now } = usePromotionSchedule();
  const events = schedules.filter((event) => isPromotionActive(event, now));
  const upcoming = schedules
    .filter((event) => !isPromotionActive(event, now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const game = activeGame === "POE1" ? "poe1" : "poe2";
  const drops = events.filter(
    (event) => event.kind === "twitch-drops" && event.game === game,
  );
  const nextDrop = upcoming.find(
    (event) => event.kind === "twitch-drops" && event.game === game,
  );
  const dropTarget = drops[0] ?? nextDrop;
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
        now={now}
        events={drops}
        relatedEvents={schedules}
        nextEvent={nextDrop}
        href={dropTarget ? promotionWatchUrl(dropTarget) : undefined}
        destination="Twitch에서 시청"
      />
      <EventBuff
        kind="stash-sale"
        now={now}
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
