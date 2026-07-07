import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createCanvas } from "canvas";
import * as opentype from "opentype.js";

/**
 * 폰트 원격 저장소 자동화 스크립트 (NORMALIZED VERSION)
 *
 * 변경 사항:
 * 1. id: 파일 바이너리 SHA-256 해시로 고정
 * 2. displayNames: 다국어 이름 객체로 확장 ({ ko, en, ... })
 * 3. license: 다국어 라이선스 객체로 확장
 * 4. previewPath: preview/${id}.png 규칙 강제
 */

interface RemoteFontItem {
  id: string;
  fileName: string;
  displayNames: { [lang: string]: string };
  previewPath: string;
  fileSize: number;
  license: { [lang: string]: string };
  licenseUrl: string;
  createdAt: string;
  updatedAt: string;
}

// 실행 인자로 경로를 받거나 기본 경로 사용
const targetFontsDir = process.argv[2] || path.join(process.cwd(), "fonts");
const FONTS_DIR = path.resolve(targetFontsDir);
const PREVIEW_DIR = path.join(FONTS_DIR, "preview");
const LIST_JSON_PATH = path.join(FONTS_DIR, "list.json");

if (!fs.existsSync(FONTS_DIR)) {
  console.error("Error: fonts/ directory not found.");
  process.exit(1);
}
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

function calculateHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// [v2] opentype.js v2의 names는 플랫폼별 구조({unicode,macintosh,windows})로
// 변경됨. 세 플랫폼을 병합해 언어별 이름을 수집한다(우선순위: windows >
// macintosh > unicode). @types/opentype.js가 아직 v1이라 unknown으로 받는다.
type NameTable = Record<string, Record<string, string | undefined> | undefined>;

const getAllNames = (names: unknown, prop: string) => {
  const n = names as {
    unicode?: NameTable;
    macintosh?: NameTable;
    windows?: NameTable;
  };
  const result: { [lang: string]: string } = {};
  // 낮은 우선순위 플랫폼부터 채워, 높은 우선순위가 같은 언어를 덮어쓴다
  for (const platform of [n.unicode, n.macintosh, n.windows]) {
    const nameObj = platform?.[prop];
    if (!nameObj) continue;
    // 가용한 모든 언어 필드 수집
    Object.keys(nameObj).forEach((lang) => {
      const val = nameObj[lang];
      if (typeof val === "string") result[lang] = val;
    });
  }
  return result;
};

async function generatePreview(fontPath: string, destPath: string) {
  try {
    // [v2] opentype.js v2는 load(path)를 제거 → 버퍼를 읽어 parse.
    const buffer = await fs.promises.readFile(fontPath);
    const font = opentype.parse(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
    );
    const text = "Path of Exile 2 - 한글 테스트";
    const fontSize = 48;
    const canvas = createCanvas(800, 120);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, 800, 120);
    const x = 20;
    const y = 80;
    const textPath = font.getPath(text, x, y, fontSize);

    ctx.beginPath();
    textPath.commands.forEach((cmd: opentype.PathCommand) => {
      if (cmd.type === "M") ctx.moveTo(cmd.x, cmd.y);
      else if (cmd.type === "L") ctx.lineTo(cmd.x, cmd.y);
      else if (cmd.type === "C")
        ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      else if (cmd.type === "Q")
        ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      else if (cmd.type === "Z") ctx.closePath();
    });

    ctx.fillStyle = "#1a1a1a";
    ctx.fill();

    fs.writeFileSync(destPath, canvas.toBuffer("image/png"));
    console.log(`  - Combined preview created at: ${path.basename(destPath)}`);
  } catch (err) {
    console.error(`  - Failed to generate preview for ${fontPath}:`, err);
  }
}

async function main() {
  console.log("--- Starting Font Asset Synchronization ---");

  // 1. 기존 리스트 로드
  let existingList: RemoteFontItem[] = [];
  if (fs.existsSync(LIST_JSON_PATH)) {
    try {
      existingList = JSON.parse(fs.readFileSync(LIST_JSON_PATH, "utf-8"));
    } catch {
      // 기존 리스트가 없거나 파싱 실패 시 무시하고 진행
    }
  }

  const files = fs
    .readdirSync(FONTS_DIR)
    .filter(
      (f) =>
        f.toLowerCase().endsWith(".ttf") || f.toLowerCase().endsWith(".otf"),
    );
  const newList: RemoteFontItem[] = [];
  const now = new Date().toISOString();

  for (const fileName of files) {
    const filePath = path.join(FONTS_DIR, fileName);
    const id = calculateHash(filePath); // 해시 기반 ID
    const fileSize = fs.statSync(filePath).size;
    const fullPreviewPath = path.join(PREVIEW_DIR, `${id}.png`);

    try {
      // [v2] opentype.js v2는 load(path)를 제거 → 버퍼를 읽어 parse.
      const fileBuffer = await fs.promises.readFile(filePath);
      const font = opentype.parse(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );
      const names: unknown = font.names;

      const fullNames = getAllNames(names, "fullName");
      const familyNames = getAllNames(names, "fontFamily");
      const license = getAllNames(names, "license");
      const licenseUrlNames = getAllNames(names, "licenseURL");
      const licenseUrl =
        licenseUrlNames.en ||
        licenseUrlNames.ko ||
        Object.values(licenseUrlNames)[0] ||
        "";

      // Smart Merge: 기존 데이터 매핑 (파일명 또는 이전 해시 기반)
      const existing = existingList.find(
        (e) => e.id === id || e.fileName === fileName,
      );

      const item: RemoteFontItem = {
        id,
        fileName,
        fullNames:
          Object.keys(fullNames).length > 0
            ? fullNames
            : { en: path.parse(fileName).name },
        familyNames:
          Object.keys(familyNames).length > 0
            ? familyNames
            : { en: path.parse(fileName).name },
        previewPath: `preview/${id}.png`,
        fileSize,
        license:
          Object.keys(license).length > 0 ? license : { en: "Unknown License" },
        licenseUrl,
        createdAt: existing?.createdAt || now,
        updatedAt: existing && existing.id === id ? existing.updatedAt : now,
      };

      newList.push(item);
      console.log(
        `- [${item.fullNames.ko || item.fullNames.en || fileName}] Processed.`,
      );

      if (!fs.existsSync(fullPreviewPath)) {
        await generatePreview(filePath, fullPreviewPath);
      }
    } catch (err) {
      console.error(`Error processing ${fileName}:`, err);
    }
  }

  // [정렬] 1순위: 등록일(createdAt) 오름차순 -> 최신 항목이 끝에 위치함
  //        2순위: 파일명(fileName) 오름차순  -> 동시 추가 시 순서 고정 (셔플 방지)
  newList.sort((a, b) => {
    if (a.createdAt !== b.createdAt)
      return a.createdAt.localeCompare(b.createdAt);
    return a.fileName.localeCompare(b.fileName);
  });

  fs.writeFileSync(LIST_JSON_PATH, JSON.stringify(newList, null, 2), "utf-8");
  console.log("\n--- Sync Completed successfully ---");
  console.log(`Updated list.json at: ${LIST_JSON_PATH}`);
}

main().catch(console.error);
