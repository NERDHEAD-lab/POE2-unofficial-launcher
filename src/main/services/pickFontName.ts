/**
 * opentype.js v2의 플랫폼별 names 구조({unicode, macintosh, windows})에서 표시
 * 이름을 추출한다. v1의 평탄 접근(fullName/fontFamily × ko/en) 우선순위를
 * 그대로 보존한다.
 *
 * 우선순위: (프로퍼티 × 언어)를 바깥 순서로, 각 쌍마다 플랫폼(windows →
 * macintosh → unicode)을 안쪽에서 훑어 첫 truthy 값을 반환한다.
 *   fullName.ko → fullName.en → fontFamily.ko → fontFamily.en
 *
 * @types/opentype.js가 아직 v1 형태(평탄 names)라 실제 v2 구조와 어긋나므로
 * `names`를 unknown으로 받아 안전하게 접근한다. names가 객체가 아니면 undefined.
 */
export function pickFontName(names: unknown): string | undefined {
  if (!names || typeof names !== "object") return undefined;

  type NameTable = Record<
    string,
    Record<string, string | undefined> | undefined
  >;
  const n = names as {
    unicode?: NameTable;
    macintosh?: NameTable;
    windows?: NameTable;
  };
  const platforms = [n.windows, n.macintosh, n.unicode];
  const pick = (prop: string, lang: string): string | undefined => {
    for (const p of platforms) {
      const v = p?.[prop]?.[lang];
      if (v) return v;
    }
    return undefined;
  };
  return (
    pick("fullName", "ko") ||
    pick("fullName", "en") ||
    pick("fontFamily", "ko") ||
    pick("fontFamily", "en")
  );
}
