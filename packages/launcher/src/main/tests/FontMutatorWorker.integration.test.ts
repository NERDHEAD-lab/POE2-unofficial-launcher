// src/main/tests/FontMutatorWorker.integration.test.ts
import fs from "node:fs";
import path from "node:path";

import { Font } from "fonteditor-core";
import { describe, it, expect } from "vitest";

/**
 * 회귀 가설: FontMutatorWorker는 Font.create(buf, { type: "ttf" })로 고정 파싱한다.
 * 사용자가 IPC pick-file 다이얼로그에서 .otf를 골랐을 경우(현재 허용됨),
 * 이 경로에서 "ttf file damaged" 또는 유사 에러가 발생해야 한다 (=현재 버그 재현).
 *
 * 샘플 폰트 경로: D:\project_poe2\POE2-unofficial-launcher-gh-pages\fonts
 * (gh-pages 리포 체크아웃 필요. 없으면 테스트는 skip 처리.)
 */

const SAMPLE_DIR = path.resolve(
  __dirname,
  "../../../../../../POE2-unofficial-launcher-gh-pages/fonts",
);

const hasSamples = fs.existsSync(SAMPLE_DIR);

function readFontType(filePath: string): "ttf" | "otf" {
  // sfnt scaler type:
  //   0x00010000 → TrueType outlines (ttf)
  //   'OTTO'     → CFF outlines (otf)
  //   'true'/'typ1' → 구형 Mac TrueType
  const fd = fs.openSync(filePath, "r");
  const head = Buffer.alloc(4);
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  if (head.toString("ascii") === "OTTO") return "otf";
  return "ttf";
}

describe.skipIf(!hasSamples)(
  "FontMutatorWorker — fonteditor-core 파싱 가설",
  () => {
    const sampleFiles = hasSamples
      ? fs
          .readdirSync(SAMPLE_DIR)
          .filter((f) => /\.(ttf|otf)$/i.test(f))
          .map((f) => path.join(SAMPLE_DIR, f))
      : [];

    it(".otf 파일을 type:'ttf'로 파싱하면 실패한다 (현재 워커 동작)", () => {
      const otfFile = sampleFiles.find((p) => p.toLowerCase().endsWith(".otf"));
      expect(otfFile, "otf 샘플 폰트가 폴더에 있어야 함").toBeTruthy();
      if (!otfFile) return;

      const buf = fs.readFileSync(otfFile);
      expect(readFontType(otfFile)).toBe("otf");

      // 현재 FontMutatorWorker.ts:52 와 동일한 호출
      expect(() => Font.create(buf, { type: "ttf" })).toThrow();
    });

    it(".otf 파일을 type:'otf'로 파싱하면 성공한다", () => {
      const otfFile = sampleFiles.find((p) => p.toLowerCase().endsWith(".otf"));
      if (!otfFile) return;

      const buf = fs.readFileSync(otfFile);
      const font = Font.create(buf, { type: "otf" });
      const data = font.get();
      expect(data.name).toBeTruthy();
      expect(typeof data.name.fontFamily).toBe("string");
    });

    it(
      "모든 .ttf 샘플은 type:'ttf'로 파싱 가능해야 한다 (변조 파이프라인 입력 적합성)",
      { timeout: 30000 },
      () => {
        const ttfFiles = sampleFiles.filter((p) =>
          p.toLowerCase().endsWith(".ttf"),
        );
        expect(ttfFiles.length).toBeGreaterThan(0);

        const failures: { file: string; error: string }[] = [];
        for (const file of ttfFiles) {
          try {
            const buf = fs.readFileSync(file);
            Font.create(buf, { type: "ttf" });
          } catch (e) {
            failures.push({
              file: path.basename(file),
              error: (e as Error).message,
            });
          }
        }

        expect(
          failures,
          `다음 .ttf 파일이 fonteditor-core ttf 파서를 통과하지 못함:\n${failures
            .map((f) => `  - ${f.file}: ${f.error}`)
            .join("\n")}`,
        ).toEqual([]);
      },
    );

    it("fonteditor-core write({type:'ttf'})는 OTF→TTF 글리프 변환을 깨뜨린다 (회귀 가드)", () => {
      // 배경: in-game 검증에서 Pretendard 한글이 거의 모두 빈 글리프로 표시됨.
      // 원인: fonteditor-core가 OTF 입력의 cmap/name은 보존하지만,
      //       write({type:'ttf'})의 CFF→glyf 변환이 한글 음절 대부분의 outline을 잃는다.
      // 이 테스트가 통과하는 한 OTF 입력은 OtfMutatorWorker(SFNT 바이트 패치) 경로를 써야 한다.
      // 미래에 fonteditor-core 업그레이드로 글리프가 보존되면 이 테스트가 실패하며,
      // 그 시점에 OTF/TTF 경로를 하나로 통합할지 재검토할 신호가 된다.
      const otfFile = sampleFiles.find((p) =>
        p.toLowerCase().endsWith("Pretendard-Regular.otf".toLowerCase()),
      );
      if (!otfFile) return;

      const buf = fs.readFileSync(otfFile);
      const font = Font.create(buf, { type: "otf" });

      // write({type:'ttf'}) 결과를 다시 파싱
      const ttfOut = font.write({ type: "ttf" });
      const reparsed = Font.create(Buffer.from(ttfOut as Uint8Array), {
        type: "ttf",
      }).get();

      // U+AC00(가): cmap에는 남아있지만 outline이 비어있는 케이스가 핵심 증거.
      type GlyfEntry = { contours?: { length: number }[] };
      const cmap = (reparsed.cmap || {}) as Record<string, number>;
      const glyf = (reparsed.glyf || []) as GlyfEntry[];
      const gidGa = cmap[0xac00];
      expect(gidGa, "U+AC00(가)가 cmap에서 사라지면 안 됨").toBeTypeOf(
        "number",
      );

      const gaContours = glyf[gidGa]?.contours?.length ?? 0;
      expect(
        gaContours,
        "회귀 가드: 만약 0보다 크게 나오면 fonteditor-core가 OTF→TTF 변환을 제대로 지원하기 시작한 것 — OTF 우회 경로 재검토 필요",
      ).toBe(0);
    });
  },
);
