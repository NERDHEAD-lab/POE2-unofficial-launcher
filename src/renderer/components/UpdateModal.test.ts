import { describe, expect, it } from "vitest";

import { getUpdateModalCopy } from "../utils/update-modal-copy";

describe("getUpdateModalCopy", () => {
  it("asks to start downloading when an update is available", () => {
    expect(
      getUpdateModalCopy({
        state: "available",
        version: "1.4.2",
      }),
    ).toMatchObject({
      title: "새로운 업데이트가 있습니다!",
      messageLines: [
        "PoE Unofficial Launcher의 새로운 버전이 출시되었습니다.",
        "지금 다운로드하시겠습니까?",
      ],
      primaryActionText: "다운로드 시작",
    });
  });

  it("shows preparation copy while the download request is starting", () => {
    expect(
      getUpdateModalCopy({
        state: "requesting",
        progress: 0,
        version: "1.4.2",
      }),
    ).toMatchObject({
      title: "업데이트 다운로드 중...",
      messageLines: ["다운로드 준비 중..."],
      primaryActionText: "다운로드 준비 중...",
    });
  });

  it("describes progress while the update is downloading", () => {
    expect(
      getUpdateModalCopy({
        state: "downloading",
        progress: 10,
        version: "1.4.2",
      }),
    ).toMatchObject({
      title: "업데이트 다운로드 중...",
      messageLines: [
        "PoE Unofficial Launcher의 새 버전을 다운로드하고 있습니다.",
        "다운로드가 완료되면 설치를 진행할 수 있습니다.",
      ],
      primaryActionText: "다운로드 중...",
    });
  });

  it("asks to restart only after the update has downloaded", () => {
    expect(
      getUpdateModalCopy({
        state: "downloaded",
        version: "1.4.2",
      }),
    ).toMatchObject({
      title: "업데이트 준비 완료!",
      messageLines: [
        "다운로드가 완료되었습니다.",
        "런처를 재시작하여 설치를 완료할까요?",
      ],
      primaryActionText: "재시작하여 설치",
    });
  });

  it("offers a retry after the download request fails", () => {
    expect(
      getUpdateModalCopy({
        state: "error",
        message: "다운로드를 시작하지 못했습니다. 다시 시도해주세요.",
        version: "1.4.2",
      }),
    ).toMatchObject({
      title: "업데이트 다운로드 실패",
      messageLines: ["다운로드를 시작하지 못했습니다. 다시 시도해주세요."],
      primaryActionText: "다시 시도",
    });
  });
});
