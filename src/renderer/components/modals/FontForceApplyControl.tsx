import { useCallback, useEffect, useRef, useState } from "react";

import {
  FONT_FORCE_APPLY_TARGETS,
  normalizeFontForceApplyState,
} from "../../../shared/font-force-apply";

import type {
  FontForceApplyPolicy,
  FontForceApplyState,
} from "../../../shared/types";

interface Props {
  cachedState?: FontForceApplyState;
  blocked: boolean;
}

/** Mounted only while the modal is visible: every open revalidates without losing the cached first paint. */
export default function FontForceApplyControl({ cachedState, blocked }: Props) {
  const [policy, setPolicy] = useState<FontForceApplyPolicy | null>(null);
  const [phase, setPhase] = useState<
    "checking" | "changing" | "ready" | "error"
  >("checking");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState("");
  const requestId = useRef(0);
  const busy = useRef(false);
  const state = policy?.state ?? normalizeFontForceApplyState(cachedState);
  const values = FONT_FORCE_APPLY_TARGETS.map((target) => state[target]);
  const checked = values.every((value) => value === true);
  const off = values.every((value) => value === false);
  const unknown = values.some((value) => value === null);
  const mixed = !unknown && values[0] !== values[1];
  const disabled = blocked || phase !== "ready" || unknown;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const id = ++requestId.current;
    setPhase("checking");
    setNotice("");
    setDetail("");
    try {
      const result = await window.electronAPI.font.getForceApplyPolicy();
      if (id !== requestId.current) return;
      setPolicy(result);
      const failed =
        Object.keys(result.errors).length > 0 ||
        Object.values(result.state).some((value) => value === null);
      setPhase(failed ? "error" : "ready");
      setDetail(
        Object.entries(result.errors)
          .map(([target, error]) => `${target}: ${error}`)
          .join("\n"),
      );
    } catch (error) {
      if (id !== requestId.current) return;
      setPhase("error");
      setDetail(error instanceof Error ? error.message : String(error));
    } finally {
      if (id === requestId.current) busy.current = false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => {
      if (!disposed) void refresh();
    });
    return () => {
      disposed = true;
      requestId.current += 1;
    };
  }, [refresh]);

  const change = async (enabled: boolean) => {
    if (disabled || busy.current) return;
    busy.current = true;
    const id = ++requestId.current;
    setPhase("changing");
    setNotice("");
    setDetail("");
    try {
      const result = await window.electronAPI.font.setForceApplyPolicy(enabled);
      if (id !== requestId.current) return;
      setPolicy(result);
      const failed =
        Object.keys(result.errors).length > 0 ||
        Object.values(result.state).some((value) => value === null);
      setPhase(failed ? "error" : "ready");
      setNotice(
        result.cancelled
          ? "관리자 권한 요청을 취소했습니다."
          : result.error
            ? "정책 변경 실패 · 대상별 상태를 확인해 주세요."
            : "정책이 반영되었습니다. 게임을 다시 실행해 주세요.",
      );
      setDetail(
        [result.error, ...Object.values(result.errors)]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (error) {
      if (id !== requestId.current) return;
      setPhase("error");
      setNotice("정책 변경 결과를 확인하지 못했습니다.");
      setDetail(error instanceof Error ? error.message : String(error));
    } finally {
      if (id === requestId.current) busy.current = false;
    }
  };

  const status =
    phase === "checking"
      ? "정책 확인 중..."
      : phase === "changing"
        ? "관리자 권한 승인 및 적용 중..."
        : phase === "error"
          ? "정책 확인 실패 · 마지막 확인값 표시"
          : notice || (mixed ? "클라이언트별 설정이 다릅니다." : "");
  const targetSummary = FONT_FORCE_APPLY_TARGETS.map(
    (target) =>
      `${target}: ${state[target] === null ? "미확인" : state[target] ? "켜짐" : "꺼짐"}`,
  ).join("\n");

  return (
    <div
      className={`font-force-apply-card ${off ? "off" : ""} ${disabled ? "disabled" : ""}`}
    >
      <label
        className="font-force-apply-option"
        title={
          blocked
            ? "게임 실행 준비 또는 실행 중에는 변경할 수 없습니다."
            : targetSummary
        }
      >
        <span
          className="material-symbols-outlined font-force-apply-icon"
          aria-hidden="true"
        >
          font_download
        </span>
        <span className="font-force-apply-copy">
          <span className="font-force-apply-title">폰트 강제 적용</span>
          <span
            className="font-force-apply-description"
            id="font-force-apply-description"
          >
            일부 화면에만 폰트가 적용될 때 사용합니다. 모든 클라이언트에 함께
            적용되며 게임을 다시 실행해야 합니다. 변경 시 관리자 권한이
            필요합니다.
          </span>
        </span>
        <input
          className="font-force-apply-checkbox"
          type="checkbox"
          aria-label="폰트 강제 적용"
          aria-describedby={
            status
              ? "font-force-apply-description font-force-apply-status"
              : "font-force-apply-description"
          }
          checked={checked}
          disabled={disabled}
          ref={(node) => {
            if (node) node.indeterminate = mixed;
          }}
          onChange={(event) => void change(event.currentTarget.checked)}
        />
      </label>
      {status ? (
        <div
          className={`font-force-apply-status ${phase === "error" || detail ? "warning" : ""}`}
        >
          <span
            id="font-force-apply-status"
            role="status"
            title={detail || targetSummary}
          >
            {status}
          </span>
          {phase === "error" && (
            <button
              type="button"
              aria-label="폰트 정책 다시 확인"
              onClick={() => void refresh()}
            >
              다시 확인
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
