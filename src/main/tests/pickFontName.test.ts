// src/main/tests/pickFontName.test.ts
import { describe, it, expect } from "vitest";

import { pickFontName } from "../services/pickFontName";

/**
 * pickFontName 우선순위/폴백 순수 단위 테스트.
 *
 * 실폰트 한 개의 happy path만 지나가는 opentype-v2-contract 테스트와 달리,
 * 여기서는 합성 names 객체로 분기(프로퍼티×언어×플랫폼)를 직접 고정한다.
 * 우선순위: fullName.ko → fullName.en → fontFamily.ko → fontFamily.en,
 * 각 쌍마다 플랫폼은 windows → macintosh → unicode 순.
 */
describe("pickFontName", () => {
  it("전부 존재하면 windows.fullName.ko를 최우선으로 고른다", () => {
    const names = {
      windows: {
        fullName: { ko: "한글 풀네임", en: "English Full" },
        fontFamily: { ko: "한글 패밀리", en: "English Family" },
      },
    };
    expect(pickFontName(names)).toBe("한글 풀네임");
  });

  it("fullName에서 ko가 en보다 우선한다", () => {
    const names = { windows: { fullName: { ko: "코", en: "En" } } };
    expect(pickFontName(names)).toBe("코");
    const enOnly = { windows: { fullName: { en: "En" } } };
    expect(pickFontName(enOnly)).toBe("En");
  });

  it("fullName이 fontFamily보다 우선한다 (fullName.en > fontFamily.ko)", () => {
    const names = {
      windows: {
        fullName: { en: "Full En" },
        fontFamily: { ko: "패밀리 코" },
      },
    };
    expect(pickFontName(names)).toBe("Full En");
  });

  it("같은 (프로퍼티,언어)에서 플랫폼은 windows > macintosh > unicode", () => {
    const all = {
      windows: { fullName: { ko: "W" } },
      macintosh: { fullName: { ko: "M" } },
      unicode: { fullName: { ko: "U" } },
    };
    expect(pickFontName(all)).toBe("W");
    expect(
      pickFontName({ macintosh: all.macintosh, unicode: all.unicode }),
    ).toBe("M");
    expect(pickFontName({ unicode: all.unicode })).toBe("U");
  });

  it("macintosh-only ko: windows 부재 시 플랫폼을 폴스루한다", () => {
    const names = { macintosh: { fullName: { ko: "맥 전용" } } };
    expect(pickFontName(names)).toBe("맥 전용");
  });

  it("(프로퍼티·언어) 쌍이 플랫폼보다 바깥 우선순위다 — windows.fontFamily.en < macintosh.fullName.ko", () => {
    // 올바른 구현(쌍 바깥·플랫폼 안쪽): fullName.ko가 모든 fontFamily보다 먼저라 "MK".
    // 틀린 구현(플랫폼 바깥): windows를 먼저 소진해 "WF"가 됨 → 이 케이스만이 둘을 구분.
    const names = {
      windows: { fontFamily: { en: "WF" } },
      macintosh: { fullName: { ko: "MK" } },
    };
    expect(pickFontName(names)).toBe("MK");
  });

  it("fullName이 전혀 없으면 fontFamily로 폴백한다 (ko 우선)", () => {
    const names = {
      windows: { fontFamily: { ko: "패밀리 코", en: "Fam En" } },
    };
    expect(pickFontName(names)).toBe("패밀리 코");
    const enOnly = { windows: { fontFamily: { en: "Fam En" } } };
    expect(pickFontName(enOnly)).toBe("Fam En");
  });

  it("빈 문자열 값은 없는 것으로 간주하고 다음 후보로 넘어간다", () => {
    const names = {
      windows: { fullName: { ko: "", en: "" } },
      macintosh: { fullName: { ko: "맥 코" } },
    };
    expect(pickFontName(names)).toBe("맥 코");
  });

  it("이름 부재: 어떤 후보도 없으면 undefined", () => {
    expect(pickFontName({})).toBeUndefined();
    expect(pickFontName({ windows: {} })).toBeUndefined();
    expect(pickFontName({ windows: { fullName: {} } })).toBeUndefined();
    expect(
      pickFontName({ windows: { postScriptName: { en: "PS" } } }),
    ).toBeUndefined();
  });

  it("names가 객체가 아니면(undefined/null/문자열) undefined", () => {
    expect(pickFontName(undefined)).toBeUndefined();
    expect(pickFontName(null)).toBeUndefined();
    expect(pickFontName("not-a-table")).toBeUndefined();
  });
});
