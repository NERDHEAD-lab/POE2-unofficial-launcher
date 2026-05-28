import fs from "node:fs";
import { parentPort } from "node:worker_threads";

import type { FontMutationRule } from "@poe2-launcher/shared/font-targets";

import { mutateOtfSfnt } from "./otfMutator";

/**
 * OTF(CFF) 전용 변조 워커. 변조 로직은 ./otfMutator.ts에 분리되어 있다.
 * 이 파일은 worker_threads 메시지 어댑터일 뿐이다.
 *
 * 인터페이스는 FontMutatorWorker(TTF)와 동일: 같은 MutatorMessage를 받고
 * 같은 { success, buffer } 또는 { error }를 반환한다.
 */

interface MutatorMessage {
  filePath: string;
  rule: FontMutationRule;
  /** 사용자 크기 보정 % (50~150). 미지정 시 100. */
  scale?: number;
}

if (parentPort) {
  parentPort.on("message", (data: MutatorMessage) => {
    const { filePath, rule } = data;
    const scale =
      typeof data.scale === "number" && data.scale > 0 ? data.scale : 100;

    try {
      if (!rule) {
        throw new Error("변조 규칙(rule) 객체가 전달되지 않았습니다.");
      }

      const buffer = fs.readFileSync(filePath);
      const finalBuffer = mutateOtfSfnt(buffer, rule, scale);
      const arrayBuffer = finalBuffer.buffer.slice(
        finalBuffer.byteOffset,
        finalBuffer.byteOffset + finalBuffer.byteLength,
      );

      parentPort?.postMessage({ success: true, buffer: arrayBuffer }, [
        arrayBuffer as ArrayBuffer,
      ]);
    } catch (e: unknown) {
      parentPort?.postMessage({
        error: (e as Error).message || "OTF 변조 과정 중 알 수 없는 오류 발생",
      });
    }
  });
}
