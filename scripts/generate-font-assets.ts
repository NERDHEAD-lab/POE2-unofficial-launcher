import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createCanvas } from "canvas";
import opentype from "opentype.js";

/**
 * 폰트 원격 저장소 자동화 스크립트
 * 역할: fonts/ 폴더를 스캔하여 list.json 및 preview/*.png 생성 (Smart Merge 지원)
 */

interface RemoteFontItem {
  id: string;
  alias: string;
  fileName: string;
  hash: string;
  previewPath: string;
  fileSize: number;
  license: string;
  licenseUrl: string;
  createdAt: string;
  updatedAt: string;
}

const FONTS_DIR = path.join(process.cwd(), "fonts");
const PREVIEW_DIR = path.join(FONTS_DIR, "preview");
const LIST_JSON_PATH = path.join(FONTS_DIR, "list.json");

// 디렉토리 체크
if (!fs.existsSync(FONTS_DIR)) {
  console.error("Error: fonts/ directory not found.");
  process.exit(1);
}
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

/**
 * 파일의 SHA-256 해시 계산
 */
function calculateHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * 미리보기 PNG 생성 (800x120)
 */
async function generatePreview(fontPath: string, destPath: string) {
  try {
    const font = await opentype.load(fontPath);
    const text = "Path of Exile 2 - 한글 테스트";
    const fontSize = 48;
    const canvas = createCanvas(800, 120);
    const ctx = canvas.getContext("2d");

    // 투명 배경
    ctx.clearRect(0, 0, 800, 120);

    const x = 20;
    const y = 80;
    const textPath = font.getPath(text, x, y, fontSize);

    // 외곽선 없이 폰트 경로를 따라 내부만 채우기
    ctx.beginPath();
    textPath.commands.forEach((cmd: any) => {
      if (cmd.type === "M") ctx.moveTo(cmd.x, cmd.y);
      else if (cmd.type === "L") ctx.lineTo(cmd.x, cmd.y);
      else if (cmd.type === "C")
        ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      else if (cmd.type === "Q")
        ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      else if (cmd.type === "Z") ctx.closePath();
    });

    ctx.fillStyle = "#1a1a1a"; // 검은색 글씨
    ctx.fill();

    fs.writeFileSync(destPath, canvas.toBuffer("image/png"));
    console.log(`  - Combined preview created at: ${path.basename(destPath)}`);
  } catch (err) {
    console.error(`  - Failed to generate preview for ${fontPath}:`, err);
  }
}

/**
 * 메인 실행 로직 (Smart Merge)
 */
async function main() {
  console.log("--- Starting Font Asset Synchronization ---");

  // 1. 기존 리스트 로드
  let existingList: RemoteFontItem[] = [];
  if (fs.existsSync(LIST_JSON_PATH)) {
    try {
      existingList = JSON.parse(fs.readFileSync(LIST_JSON_PATH, "utf-8"));
      console.log(
        `Loaded existing list.json with ${existingList.length} items.`,
      );
    } catch (err) {
      console.warn(
        "Warning: Failed to parse existing list.json, starting fresh.",
      );
    }
  }

  // 2. 폰트 폴더 스캔
  const files = fs
    .readdirSync(FONTS_DIR)
    .filter(
      (f) =>
        f.toLowerCase().endsWith(".ttf") || f.toLowerCase().endsWith(".otf"),
    );
  console.log(`Scanning fonts directory... Found ${files.length} font files.`);

  const newList: RemoteFontItem[] = [];
  const now = new Date().toISOString();

  for (const fileName of files) {
    const filePath = path.join(FONTS_DIR, fileName);
    const hash = calculateHash(filePath);
    const fileSize = fs.statSync(filePath).size;

    // ID는 파일명을 기반으로 일관되게 생성 (확장자 제외)
    const id = path
      .parse(fileName)
      .name.replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();

    const existingEntry = existingList.find((e) => e.id === id);
    const previewPath = `preview/${id}.png`;
    const fullPreviewPath = path.join(PREVIEW_DIR, `${id}.png`);

    let fontInfo: any = {};
    try {
      const font = await opentype.load(filePath);
      fontInfo = {
        familyName: font.names.fontFamily?.en || id,
        license: font.names.license?.en || "Unknown License",
        licenseUrl: font.names.licenseURL?.en || "",
      };
    } catch (e) {
      console.warn(
        `  - [${fileName}] Could not extract metadata, using defaults.`,
      );
      fontInfo = { familyName: id, license: "Unknown License", licenseUrl: "" };
    }

    // 3. Smart Merge 로직 적용
    const item: RemoteFontItem = {
      id,
      fileName,
      hash,
      fileSize,
      previewPath,
      // 기존 alias가 수동으로 수정되었을 수 있으므로 보존
      alias: existingEntry?.alias || fontInfo.familyName,
      license: fontInfo.license,
      // 기존 licenseUrl도 보존 (수동 링크 연결 지원)
      licenseUrl: existingEntry?.licenseUrl || fontInfo.licenseUrl,
      createdAt: existingEntry?.createdAt || now,
      // 해시가 다를 때만 updatedAt 업데이트
      updatedAt:
        existingEntry && existingEntry.hash === hash
          ? existingEntry.updatedAt
          : now,
    };

    newList.push(item);
    console.log(
      `  - [${id}] Processed. Alias: ${item.alias}${existingEntry ? " (Merged)" : " (New)"}`,
    );

    // 미리보기 재생성 조건: 해시 불일치 혹은 이미지 부재
    if (
      !existingEntry ||
      existingEntry.hash !== hash ||
      !fs.existsSync(fullPreviewPath)
    ) {
      await generatePreview(filePath, fullPreviewPath);
    }
  }

  // 4. list.json 저장
  fs.writeFileSync(LIST_JSON_PATH, JSON.stringify(newList, null, 2), "utf-8");
  console.log("--- Sync Completed successfully ---");
  console.log(`Updated list.json at: ${LIST_JSON_PATH}`);
}

main().catch(console.error);
