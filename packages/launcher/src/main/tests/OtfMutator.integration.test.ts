// src/main/tests/OtfMutator.integration.test.ts
import fs from "node:fs";
import path from "node:path";

import { Font } from "fonteditor-core";
import { describe, it, expect } from "vitest";

import { FONT_MUTATION_DEFINITIONS } from "@poe2-launcher/shared/font-targets";

import { mutateOtfSfnt } from "../workers/otfMutator";

/**
 * OtfMutator: SFNT 레벨 변조기.
 * 검증 포인트:
 *  - CFF 컨테이너(OTTO scaler) 유지 → 한글 글리프 보존
 *  - name table 6필드가 본체 정답 이름으로 교체
 *  - OS/2/hhea/head 메트릭이 unitsPerEm 비율로 정확히 스케일
 *
 * 샘플 폰트 경로 없으면 skip (CI는 launcher 리포만 체크아웃하므로).
 */

const SAMPLE_DIR = path.resolve(
  __dirname,
  "../../../../../../POE2-unofficial-launcher-gh-pages/fonts",
);
const hasSamples = fs.existsSync(SAMPLE_DIR);

describe.skipIf(!hasSamples)("OtfMutator — SFNT 변조기", () => {
  const samplePath = (name: string) => path.join(SAMPLE_DIR, name);

  it("Pretendard.otf(upm=2048)를 Noto Sans CJK TC Book으로 변조: 이름/메트릭/한글 글리프 보존", () => {
    const src = samplePath("Pretendard-Regular.otf");
    if (!fs.existsSync(src)) return;

    const rule = FONT_MUTATION_DEFINITIONS["Noto Sans CJK TC Book"];
    const out = mutateOtfSfnt(fs.readFileSync(src), rule, 100);

    // 1. scaler가 OTTO 유지 (CFF 컨테이너)
    expect(out.slice(0, 4).toString("ascii")).toBe("OTTO");

    // 2. fonteditor-core로 다시 파싱해 필드 검증
    const re = Font.create(out, { type: "otf" }).get();
    expect(re.name.fontFamily).toBe(rule.family);
    expect(re.name.fontSubFamily).toBe(rule.subfamily);
    expect(re.name.fullName).toBe(rule.fullName);
    expect(re.name.postScriptName).toBe(rule.postScript);
    expect(re.name.uniqueSubFamily).toBe(rule.metrics!.uniqueSubFamily);
    expect(re.name.version).toBe(rule.metrics!.version);

    // 3. 한글 cmap 전체 보존
    const cmap = (re.cmap || {}) as Record<string, number>;
    const hangulCount = Object.keys(cmap).filter((cp) => {
      const c = parseInt(cp, 10);
      return c >= 0xac00 && c <= 0xd7a3;
    }).length;
    expect(hangulCount).toBe(11172);

    // 4. unitsPerEm 비율 보정 — Pretendard 2048 / 본체 1000 = 2.048
    const ratio = re.head.unitsPerEm / rule.metrics!.unitsPerEm;
    expect(re.hhea.ascent).toBe(
      Math.round(rule.metrics!.baseHheaAscent * ratio),
    );
    expect(re.hhea.descent).toBe(
      Math.round(rule.metrics!.baseHheaDescent * ratio),
    );
    expect(re["OS/2"].usWinAscent).toBe(
      Math.round(rule.metrics!.baseWinAscent * ratio),
    );
    expect(re["OS/2"].usWinDescent).toBe(
      Math.round(rule.metrics!.baseWinDescent * ratio),
    );
    expect(re["OS/2"].usWeightClass).toBe(rule.metrics!.usWeightClass);
    expect(re["OS/2"].fsSelection).toBe(rule.metrics!.fsSelection);
  });

  it("동일 입력을 Spoqa Han Sans Neo로 변조: 이름·메트릭 분리 검증", () => {
    const src = samplePath("Pretendard-Regular.otf");
    if (!fs.existsSync(src)) return;

    const rule = FONT_MUTATION_DEFINITIONS["Spoqa Han Sans Neo Regular"];
    const out = mutateOtfSfnt(fs.readFileSync(src), rule, 100);
    const re = Font.create(out, { type: "otf" }).get();

    expect(re.name.fontFamily).toBe("Spoqa Han Sans Neo");
    expect(re.name.postScriptName).toBe("SpoqaHanSansNeo-Regular");
    // fsSelection이 Noto(64)와 다른 Spoqa(192)로 박혔는지 — 룰 분리 검증
    expect(re["OS/2"].fsSelection).toBe(192);
  });

  it("TTF(non-OTTO) 입력은 거부한다", () => {
    const ttfPath = fs
      .readdirSync(SAMPLE_DIR)
      .find((f) => f.toLowerCase().endsWith(".ttf"));
    if (!ttfPath) return;

    const rule = FONT_MUTATION_DEFINITIONS["Noto Sans CJK TC Book"];
    expect(() =>
      mutateOtfSfnt(fs.readFileSync(samplePath(ttfPath)), rule, 100),
    ).toThrow(/OTTO/);
  });

  it("scale=150 적용 시 hhea/winAscent가 (100/150) 비율로 줄어든다", () => {
    const src = samplePath("Pretendard-Regular.otf");
    if (!fs.existsSync(src)) return;

    const rule = FONT_MUTATION_DEFINITIONS["Noto Sans CJK TC Book"];
    const out100 = mutateOtfSfnt(fs.readFileSync(src), rule, 100);
    const out150 = mutateOtfSfnt(fs.readFileSync(src), rule, 150);

    const a100 = Font.create(out100, { type: "otf" }).get();
    const a150 = Font.create(out150, { type: "otf" }).get();

    // scale% ↑ = 글자 크게 보임 = 라인높이가 100/scale배로 줄어듦.
    // hhea.lineHeight (ascent - descent) 비율 검증.
    const line100 = a100.hhea.ascent - a100.hhea.descent;
    const line150 = a150.hhea.ascent - a150.hhea.descent;
    // 150%면 라인높이가 100/150 ≈ 0.667배. ±2 단위 라운딩 허용.
    const expected150 = Math.round(line100 * (100 / 150));
    expect(Math.abs(line150 - expected150)).toBeLessThanOrEqual(2);
  });
});
