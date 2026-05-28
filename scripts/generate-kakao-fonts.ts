import fs from "fs";
import path from "path";

import { Font } from "fonteditor-core";

// --- 변조 대상 메타데이터 상수 정의 (기준 폰트 1, 2와 1:1 완벽 매칭) ---
const TARGET_FONTS = [
  {
    id: "NOTO",
    family: "Noto Sans CJK TC", // 윈도우 제목용: Book 제외
    subfamily: "Book", // GDrive 인식용: Book 기입
    fullName: "Noto Sans CJK TC", // 윈도우 제목용: Book 제외
    postScript: "NotoSansCJKTC",
    outputFile: "Kakao_Noto.ttf",
  },
  {
    id: "SPOQA",
    family: "Spoqa Han Sans Neo",
    subfamily: "Regular",
    fullName: "Spoqa Han Sans Neo Regular", // 기준 폰트 2번과 동일하게 Regular 포함
    postScript: "SpoqaHanSansNeo-Regular",
    outputFile: "Kakao_Spoqa.ttf",
  },
];

// 원본 소스: 항상 kodia.ttf를 사용
const sourcePath = path.join(
  __dirname,
  "../packages/launcher/src/main/assets/fonts/defaults/kodia.ttf",
);

const mutateFont = (config: (typeof TARGET_FONTS)[0]) => {
  console.log(
    `\n--- [${config.id}] 원본 Kodia 변조 시작 -> ${config.fullName} (${config.subfamily}) ---`,
  );

  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ 원본 소스 파일을 찾을 수 없습니다: ${sourcePath}`);
    return;
  }

  // 1. 소스 로드 (Kodia 원본)
  const buffer = fs.readFileSync(sourcePath);
  const font = Font.create(buffer, { type: "ttf" });
  const fontData = font.get();

  // 2. Name Table 주입 (기준폰트 1, 2의 데이터 1:1 복제)
  const name = fontData.name;

  name.fontFamily = config.family; // ID 1 (Book 없음)
  name.fontSubFamily = config.subfamily; // ID 2 (Book 포함 - 특정 엔진용)
  name.fullName = config.fullName; // ID 4 (Book 없음)
  name.postScriptName = config.postScript; // ID 6
  name.preferredFamily = config.family; // ID 16
  name.preferredSubFamily = config.subfamily; // ID 17

  // Unique ID (ID 3)
  name.uniqueSubFamily = `${config.postScript};${name.version}`;

  // 3. 파일 저장
  const outputBuffer = font.write({ type: "ttf" });
  const outputPath = path.join(__dirname, "..", config.outputFile);
  fs.writeFileSync(outputPath, Buffer.from(outputBuffer as ArrayBuffer));

  console.log(
    `✅ [${config.id}] 생성 완료! (윈도우 제목 클린 / 서브패밀리 Book 적용)`,
  );
  console.log(`📍 경로: ${outputPath}`);
};

try {
  TARGET_FONTS.forEach(mutateFont);

  console.log("\n--------------------------------------------------");
  console.log(
    "✅ 기준 폰트와 1:1로 일치하는 메타데이터 이식이 완료되었습니다.",
  );
  console.log(
    "루트 폴더의 Kakao_Noto.ttf와 Kakao_Spoqa.ttf를 다시 확인해 주세요.",
  );
} catch (e: unknown) {
  console.error("오류 발생:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}
