import fs from "node:fs";
import { parentPort } from "node:worker_threads";

import { Font } from "fonteditor-core";

import { FontMutationRule } from "@poe2-launcher/shared/font-targets";

/**
 * 폰트 메타데이터 + metrics 변조 워커 (Precision Mutator)
 *
 * - Name Table(ID 1,2,3,4,5,6): 본체 정답값 주입.
 *   ID 16/17은 본체에 없으므로 주입하지 않는다(제거).
 * - metrics: 게임 본체 폰트(slider 100% 기준)를 scale%로 비례 조정.
 *   공식 근거: scratch/font-mutation-analysis.md 9.4.
 *   글리프는 건드리지 않는다(수직 보정은 STEP 3 별도).
 */

interface MutatorMessage {
  filePath: string;
  rule: FontMutationRule;
  /** 크기 보정 % (50~150). 미지정 시 100. */
  scale?: number;
}

/** scale% 적용한 라인높이/ascent/descent 산출 (9.4 공식). */
function scaledLine(
  baseAscent: number,
  baseDescent: number,
  scale: number,
): { ascent: number; descent: number } {
  const baseLine = baseAscent - baseDescent; // descent는 음수
  const ascRatio = baseAscent / baseLine;
  // 글자 크기 ∝ 1/라인높이 → scale% 크게 보이려면 라인높이 (100/scale)배
  const newLine = Math.round((baseLine * 100) / scale);
  const ascent = Math.round(newLine * ascRatio);
  const descent = ascent - newLine; // 음수
  return { ascent, descent };
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
      const font = Font.create(buffer, { type: "ttf" });
      const fontData = font.get();
      const name = fontData.name;
      const m = rule.metrics;

      // 1. Name Table 주입
      name.fontFamily = rule.family; // ID 1
      name.fontSubFamily = rule.subfamily; // ID 2
      name.fullName = rule.fullName; // ID 4
      name.postScriptName = rule.postScript; // ID 6

      if (m) {
        // 본체 정답값: uniqueSubFamily(ID 3) / version(ID 5) 원문 주입
        name.uniqueSubFamily = m.uniqueSubFamily;
        name.version = m.version;
      } else {
        // 본체 미확보(GGG): 기존 동작 유지 (합성 ID 3)
        name.uniqueSubFamily = `${rule.postScript};${name.version || "1.000"}`;
      }
      // ID 16/17(preferredFamily/SubFamily)는 본체에 없으므로 주입하지 않는다.
      // fonteditor-core가 미설정 필드를 비우도록 명시적으로 삭제.
      delete (name as Record<string, unknown>).preferredFamily;
      delete (name as Record<string, unknown>).preferredSubFamily;

      // 2. metrics 주입 (정답 폰트만)
      if (m) {
        const head = fontData.head;
        const hhea = fontData.hhea;
        const os2 = fontData["OS/2"];

        // 본체 정답값은 unitsPerEm=1000 기준. 입력 폰트가 다른 upm이면 비율로 보정한다
        // (예: Pretendard 2048, 일부 maplestory/binggrae 900). 안 그러면 게임이 본체와
        // 다른 단위로 ascent/descent를 해석해 글자가 작게 또는 잘리게 나온다.
        const upmRatio = head.unitsPerEm / m.unitsPerEm;
        const u = (v: number) => Math.round(v * upmRatio);

        // hhea.descent는 음수, baseWinDescent는 양수 표기 → 음수로 변환해 전달
        const h = scaledLine(u(m.baseHheaAscent), u(m.baseHheaDescent), scale);
        const w = scaledLine(u(m.baseWinAscent), u(-m.baseWinDescent), scale);

        hhea.ascent = h.ascent;
        hhea.descent = h.descent;
        hhea.lineGap = 0;

        os2.usWinAscent = w.ascent;
        os2.usWinDescent = -w.descent; // scaledLine descent(음수) → 양수 표기

        // scale 무관, upm만 보정
        os2.sTypoAscender = u(m.typoAscender);
        os2.sTypoDescender = u(m.typoDescender);
        os2.sTypoLineGap = u(m.typoLineGap);
        os2.fsSelection = m.fsSelection;
        os2.usWeightClass = m.usWeightClass;
        head.macStyle = m.macStyle;
      }

      // 3. 변조 버퍼 생성 및 반환
      const outputData = font.write({ type: "ttf" });
      const finalBuffer = Buffer.from(outputData as Uint8Array);
      const arrayBuffer = finalBuffer.buffer.slice(
        finalBuffer.byteOffset,
        finalBuffer.byteOffset + finalBuffer.byteLength,
      );

      parentPort?.postMessage(
        {
          success: true,
          buffer: arrayBuffer,
        },
        [arrayBuffer as ArrayBuffer],
      );
    } catch (e: unknown) {
      parentPort?.postMessage({
        error: (e as Error).message || "변조 과정 중 알 수 없는 오류 발생",
      });
    }
  });
}
