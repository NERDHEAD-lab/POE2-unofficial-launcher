import {
  STASH_LINKS,
  TWITCH_LINKS,
  formatPromotionPeriod,
  promotionTitle,
  promotionMatchesTarget,
  type PromotionEvent,
} from "../../shared/promotions";

import "./PromotionRow.css";

export function PromotionRow({
  event,
  isRead,
  onRead,
  onDismiss,
}: {
  event: PromotionEvent;
  isRead: boolean;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const exactPeriod = `${new Date(event.startsAt).toLocaleString()} ~ ${new Date(event.endsAt).toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  const content = (
    <>
      <span className="material-symbols-outlined" aria-hidden="true">
        info
      </span>
      <span>
        <strong>
          {promotionTitle(event)} 진행 중{" "}
          <span className="promotion-period" title={exactPeriod}>
            ({formatPromotionPeriod(event)})
          </span>
        </strong>
        {event.kind === "stash-sale" && (
          <span className="promotion-shop-links">
            {STASH_LINKS.filter((service) =>
              service.games.some((link) =>
                promotionMatchesTarget(event, service.service, link.game),
              ),
            ).map((service) => (
              <span key={service.service} className="promotion-service">
                <span>{service.service}:</span>
                {service.games
                  .filter((link) =>
                    promotionMatchesTarget(event, service.service, link.game),
                  )
                  .map((link) => (
                    <a
                      key={link.game}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${service.service} ${link.game} 보관함 상점`}
                      onClick={onRead}
                      onAuxClick={(e) => {
                        if (e.button === 1) onRead();
                      }}
                    >
                      {link.game}
                    </a>
                  ))}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
  return (
    <div
      className={`promotion-item${isRead ? " notification-read" : ""}`}
      data-promotion-id={event.id}
    >
      {event.kind === "twitch-drops" ? (
        <a
          className="promotion-row promotion-twitch"
          href={TWITCH_LINKS[event.game === "poe1" ? "POE1" : "POE2"]}
          target="_blank"
          rel="noreferrer"
          onClick={onRead}
          onAuxClick={(e) => {
            if (e.button === 1) onRead();
          }}
        >
          {content}
        </a>
      ) : (
        <div className="promotion-row">{content}</div>
      )}
      <button
        type="button"
        className="promotion-dismiss"
        aria-label={`${promotionTitle(event)} 알림 닫기`}
        aria-haspopup="dialog"
        onClick={onDismiss}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}
