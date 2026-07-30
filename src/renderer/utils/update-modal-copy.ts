import {
  UPDATE_DOWNLOAD_FAILURE_MESSAGE,
  UpdateStatus,
} from "../../shared/types";

export const getUpdateModalCopy = (status: UpdateStatus) => {
  if (status.state === "requesting") {
    return {
      title: "업데이트 다운로드 중...",
      messageLines: ["다운로드 준비 중..."],
      primaryActionText: "다운로드 준비 중...",
    };
  }

  if (status.state === "downloading") {
    return {
      title: "업데이트 다운로드 중...",
      messageLines: [
        "PoE Unofficial Launcher의 새 버전을 다운로드하고 있습니다.",
        "다운로드가 완료되면 설치를 진행할 수 있습니다.",
      ],
      primaryActionText: "다운로드 중...",
    };
  }

  if (status.state === "downloaded") {
    return {
      title: "업데이트 준비 완료!",
      messageLines: [
        "다운로드가 완료되었습니다.",
        "런처를 재시작하여 설치를 완료할까요?",
      ],
      primaryActionText: "재시작하여 설치",
    };
  }

  if (status.state === "error") {
    return {
      title: "업데이트 다운로드 실패",
      messageLines: [status.message || UPDATE_DOWNLOAD_FAILURE_MESSAGE],
      primaryActionText: "다시 시도",
    };
  }

  return {
    title: "새로운 업데이트가 있습니다!",
    messageLines: [
      "PoE Unofficial Launcher의 새로운 버전이 출시되었습니다.",
      "지금 다운로드하시겠습니까?",
    ],
    primaryActionText: "다운로드 시작",
  };
};
