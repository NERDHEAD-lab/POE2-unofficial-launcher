// src/main/tests/opentype-v2-contract.integration.test.ts
import fs from "node:fs";
import path from "node:path";

import * as opentype from "opentype.js";
import { describe, it, expect } from "vitest";

/**
 * opentype.js v2 계약 회귀 가드 (#182 마이그레이션).
 *
 * FontManager(커스텀 폰트 파싱·이름추출·썸네일)는 electron 런타임 의존이라 vitest로
 * 직접 못 띄우지만, 그 코드가 기대는 opentype v2 API 표면은 여기서 저장소 내장 실폰트
 * (GmarketSansTTFBold.ttf — 한글 fullName·글리프 보유)로 CI에 고정한다. v1→v2에서
 * 깨졌던 지점(default export 없음, load 제거, names 플랫폼별 재편)을 명시적으로 검증한다.
 */
const FONT_PATH = path.resolve(
  __dirname,
  "../../renderer/assets/fonts/GmarketSansTTFBold.ttf",
);

function parseFont(): opentype.Font {
  const buf = fs.readFileSync(FONT_PATH);
  return opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}

describe("opentype.js v2 계약 (FontManager 의존 표면)", () => {
  it("namespace import로 parse가 함수다 (v2는 default export 없음)", () => {
    expect(typeof opentype.parse).toBe("function");
  });

  it("실 TTF를 parse한다 (load 제거 → buffer parse 경로)", () => {
    const font = parseFont();
    expect(font).toBeTruthy();
    expect(typeof font.charToGlyph).toBe("function");
  });

  it("names는 v2 플랫폼별 구조 — windows.fullName에서 ko/en을 얻는다", () => {
    const names = parseFont().names as unknown as {
      windows?: { fullName?: Record<string, string | undefined> };
    };
    expect(names.windows?.fullName?.ko).toBe("G마켓 산스 TTF Bold");
    expect(names.windows?.fullName?.en).toBe("Gmarket Sans TTF Bold");
  });

  it("v1식 평탄 names 접근은 v2에서 undefined (마이그레이션이 필요했던 이유)", () => {
    const flat = parseFont().names as unknown as { fullName?: unknown };
    expect(flat.fullName).toBeUndefined();
  });

  it("한글 글리프 판정: charToGlyph('가')가 유효 unicode를 준다", () => {
    const g = parseFont().charToGlyph("가");
    expect(g?.unicode).toBe(44032);
  });

  it("썸네일 생성 표면: getAdvanceWidth/getPath/toSVG/tables.os2가 동작한다", () => {
    const font = parseFont();
    expect(font.getAdvanceWidth("가", 32)).toBeGreaterThan(0);
    const svg = font.getPath("가", 0, 0, 32).toSVG(2);
    expect(typeof svg).toBe("string");
    expect(svg.length).toBeGreaterThan(0);
    // v2 toSVG는 fill 속성을 생략 → FontManager가 replace 없이 path를 그대로 삽입하는 근거.
    expect(svg).not.toContain("fill=");
    const os2 = font.tables.os2 as { sTypoAscender?: unknown };
    expect(typeof os2.sTypoAscender).toBe("number");
  });
});
