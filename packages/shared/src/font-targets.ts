/**
 * 폰트 변조 및 시스템 등록을 위한 타겟 정보 정의 (Source of Truth)
 *
 * - metrics 상수는 PoE 게임 본체(content.ggpk) 추출 폰트 실측값.
 *   근거: scratch/font-mutation-analysis.md 9.3 (게임 본체 = 정답 기준).
 *   PoE1·PoE2 폰트 파일 MD5 동일 → 게임 분기 불필요.
 * - GGG(Global)는 본체 폰트 미확보로 metrics 미적용(name table만).
 */

export interface FontMutationRule {
  // --- name table (게임 인식용) ---
  family: string; // ID 1 / 16
  subfamily: string; // ID 2 / 17
  fullName: string; // ID 4
  postScript: string; // ID 6

  /**
   * metrics 변조 대상 폰트면 본체 정답값을 정의한다.
   * 미정의(GGG/Fontin)면 name table만 변조하고 metrics·scale은 건드리지 않는다.
   */
  metrics?: FontBaseMetrics;
}

/**
 * PoE 본체 폰트 metrics (slider 100% 기준값). unitsPerEm 1000 전제.
 * - uniqueSubFamily / version: 본체 원문 그대로 (현재 코드의 잘못된 합성 대체)
 * - preferredFamily/SubFamily(ID 16/17)는 본체에 없으므로 주입하지 않는다.
 */
export interface FontBaseMetrics {
  uniqueSubFamily: string; // ID 3
  version: string; // ID 5

  baseHheaAscent: number;
  baseHheaDescent: number; // 음수
  baseWinAscent: number;
  baseWinDescent: number; // 양수

  typoAscender: number;
  typoDescender: number; // 음수
  typoLineGap: number;

  fsSelection: number;
  usWeightClass: number;
  macStyle: number;
  unitsPerEm: number;
}

/**
 * 폰트 메타데이터 변조 상세 규격
 */
export const FONT_MUTATION_DEFINITIONS: Record<string, FontMutationRule> = {
  // GGG (Global Path of Exile 2) — 본체 폰트 미확보, name table만 변조
  Fontin: {
    family: "Fontin",
    subfamily: "Regular",
    fullName: "Fontin",
    postScript: "Fontin-Regular",
  },
  "Fontin SmallCaps": {
    family: "Fontin SmallCaps",
    subfamily: "Regular",
    fullName: "Fontin SmallCaps",
    postScript: "FontinSmallCaps-Regular",
  },

  // Kakao Games (Korean Path of Exile 2) — 본체 정답 metrics 적용
  "Noto Sans CJK TC Book": {
    family: "Noto Sans CJK TC",
    subfamily: "Book",
    fullName: "Noto Sans CJK TC",
    postScript: "NotoSansCJKTC",
    metrics: {
      uniqueSubFamily: "2.004;GOOG;NotoSansCJKtc-Regular;ADOBE",
      version: "Version 2.004;hotconv 1.0.118;makeotfexe 2.5.65603",
      baseHheaAscent: 1160,
      baseHheaDescent: -288,
      baseWinAscent: 1160,
      baseWinDescent: 288,
      typoAscender: 880,
      typoDescender: -120,
      typoLineGap: 0,
      fsSelection: 64,
      usWeightClass: 400,
      macStyle: 0,
      unitsPerEm: 1000,
    },
  },
  "Spoqa Han Sans Neo Regular": {
    family: "Spoqa Han Sans Neo",
    subfamily: "Regular",
    fullName: "Spoqa Han Sans Neo Regular",
    postScript: "SpoqaHanSansNeo-Regular",
    metrics: {
      uniqueSubFamily:
        "Version 1.100;hotconv 1.0.109;makeotfexe 2.5.65596;GOOG;SpoqaHanSansNeo-Regular;2021;FL714",
      version: "Version 1.100;hotconv 1.0.109;makeotfexe 2.5.65596",
      baseHheaAscent: 970,
      baseHheaDescent: -282,
      baseWinAscent: 1100,
      baseWinDescent: 310,
      typoAscender: 970,
      typoDescender: -282,
      typoLineGap: 0,
      fsSelection: 192,
      usWeightClass: 400,
      macStyle: 0,
      unitsPerEm: 1000,
    },
  },
};

/**
 * 서비스별 타겟 폰트 매핑
 * - UI 및 배프 패치 로직에서 사용됩니다.
 */
export const TARGET_SERVICES_CONFIG: Record<string, string[]> = {
  GGG: ["Fontin", "Fontin SmallCaps"],
  "Kakao Games": ["Noto Sans CJK TC Book", "Spoqa Han Sans Neo Regular"],
};

/**
 * 타겟 폰트명을 시스템 등록 가능한 모든 변형으로 확장한다.
 *
 * `Noto Sans CJK TC Book` 은 환경에 따라 'Book' 이 붙은/안 붙은 두 이름으로
 * 시스템에 등록될 수 있다. **감지와 제거가 반드시 동일한 확장 목록을 써야**
 * Book/non-Book 불일치로 한쪽만 정리되는 비대칭 버그가 안 생긴다.
 */
export function expandTargetNames(targets: string[]): string[] {
  const expanded = [...targets];
  if (targets.includes("Noto Sans CJK TC Book")) {
    expanded.push("Noto Sans CJK TC");
  }
  return expanded;
}

/**
 * 타겟 폰트명 → 크기 슬라이더 설정 키 매핑.
 * 슬라이더 범위 50~150(%), 기본 100.
 */
export const FONT_SCALE_CONFIG_KEY: Record<
  string,
  "fontScaleNoto" | "fontScaleSpoqa"
> = {
  "Noto Sans CJK TC Book": "fontScaleNoto",
  "Spoqa Han Sans Neo Regular": "fontScaleSpoqa",
};

export const FONT_SCALE_MIN = 50;
export const FONT_SCALE_MAX = 150;
export const FONT_SCALE_DEFAULT = 100;

/**
 * 폰트 변조 스키마 버전. 변조 로직(name table/metrics 규칙)이 바뀔 때마다 올린다.
 * - 1: 구버전 (name table 6필드, metrics 미변조) — 명시 저장 안 됨, 미설정=1로 간주
 * - 2: 본체 metrics 주입 + name table 결함 정정 (STEP 2)
 * 설치된 폰트의 schema < 현재값이면 재적용 마이그레이션이 필요하다.
 */
export const FONT_MUTATION_SCHEMA = 2;
