import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UpdateModal from "./UpdateModal";

import type { UpdateStatus } from "../../shared/types";

const renderModal = (status: UpdateStatus) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <UpdateModal
      isOpen
      version={"version" in status ? status.version || "" : ""}
      status={status}
      onUpdate={vi.fn()}
      onInstall={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return container;
};

describe("UpdateModal view states", () => {
  it("shows a locked 0% progress view while requesting", () => {
    const modal = renderModal({
      state: "requesting",
      progress: 0,
      version: "1.6.1",
    });

    expect(modal.textContent).toContain("다운로드 준비 중...");
    expect(modal.textContent).toContain("0%");
    expect(modal.querySelector(".update-changelog-list")).toBeNull();
    expect(
      modal.querySelector<HTMLButtonElement>(".btn-update-primary")?.disabled,
    ).toBe(true);
    expect(modal.querySelector(".update-secondary-actions")).toBeNull();
  });

  it("shows the first actual progress value as downloading", () => {
    const modal = renderModal({
      state: "downloading",
      progress: 7.25,
      version: "1.6.1",
    });

    expect(modal.textContent).toContain("업데이트 다운로드 중...");
    expect(modal.textContent).toContain("7%");
    expect(modal.querySelector(".update-secondary-actions")).toBeNull();
  });

  it("shows an enabled retry state after failure", () => {
    const modal = renderModal({
      state: "error",
      message: "다운로드를 시작하지 못했습니다. 다시 시도해주세요.",
      version: "1.6.1",
    });

    expect(modal.textContent).toContain(
      "다운로드를 시작하지 못했습니다. 다시 시도해주세요.",
    );
    expect(
      modal.querySelector<HTMLButtonElement>(".btn-update-primary")?.disabled,
    ).toBe(false);
    expect(modal.querySelector(".btn-update-primary")?.textContent).toContain(
      "다시 시도",
    );
    expect(modal.querySelector(".update-secondary-actions")).not.toBeNull();
  });

  it("preserves restart and manual update actions after download", () => {
    const modal = renderModal({
      state: "downloaded",
      version: "1.6.1",
    });

    expect(modal.querySelector(".btn-update-primary")?.textContent).toContain(
      "재시작하여 설치",
    );
    expect(modal.querySelector(".btn-update-manual")?.textContent).toContain(
      "수동 업데이트",
    );
    expect(modal.querySelector(".update-secondary-actions")).not.toBeNull();
  });
});
