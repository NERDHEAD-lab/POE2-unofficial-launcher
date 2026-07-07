import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { app } from "electron";
import * as opentype from "opentype.js";

import { SyncEngine } from "./SyncEngine";
import {
  TARGET_SERVICES_CONFIG,
  FONT_MUTATION_DEFINITIONS,
  FontMutationRule,
  FONT_SCALE_CONFIG_KEY,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_MUTATION_SCHEMA,
  expandTargetNames,
} from "../../shared/font-targets";
import {
  UnifiedFontData,
  CustomFontData,
  RemoteFontItem,
  DetectedExternalFont,
  ImportSelection,
} from "../../shared/types";
import {
  getAllGameStatuses,
  isLaunchBlockingStatus,
} from "../state/GameStatusStore";
import { getConfig } from "../store";
import { setConfigWithEvent } from "../utils/config-utils";
import { Logger } from "../utils/logger";
import { PowerShellManager } from "../utils/powershell";
import { getProcessesInfo } from "../utils/process";

const FONT_UPDATE_BLOCKING_PROCESSES = [
  "POE2_Launcher.exe",
  "POE_Launcher.exe",
  "PathOfExile_KG.exe",
  "PathOfExile_x64_KG.exe",
  "PathOfExile.exe",
  "PathOfExile_x64.exe",
] as const;

export interface AddFontOptions {
  filePath: string;
  customAlias?: string;
  previewDataUrl?: string;
  remoteSourceId?: string | null;
}

const logger = new Logger({ type: "font-manager", typeColor: "#f39c12" });

export class FontManager {
  private static instance: FontManager;
  private readonly customFontsDir: string;
  private readonly syncEngine: SyncEngine;
  private fontsMap: Map<string, CustomFontData> = new Map();
  private remoteCatalog: RemoteFontItem[] = [];
  private initPromise: Promise<void>;
  private systemFontCleanupPromise: Promise<void> | null = null;

  private constructor() {
    this.customFontsDir = path.join(app.getPath("userData"), "CustomFonts");
    this.syncEngine = SyncEngine.getInstance();
    this.initPromise = this.ensureDirectory().catch((err) => {
      logger.error(`Failed to ensure CustomFonts directory: ${err}`);
    });
  }

  public static getInstance(): FontManager {
    if (!FontManager.instance) {
      FontManager.instance = new FontManager();
    }
    return FontManager.instance;
  }

  private async ensureDirectory() {
    try {
      await fs.access(this.customFontsDir);
    } catch {
      await fs.mkdir(this.customFontsDir, { recursive: true });
    }
    await this.loadFontsFromDisk();
    // 백그라운드에서 원격 카탈로그 동기화 시작
    this.syncWithRemote().catch((err) => {
      logger.error(`Background sync failed: ${err}`);
    });
  }

  /**
   * 원격 저장소와 카탈로그 동기화
   */
  public async syncWithRemote(force: boolean = false): Promise<void> {
    this.remoteCatalog = await this.syncEngine.fetchCatalog({ force });
    this.notifyRenderer();
  }

  public getCatalog(): RemoteFontItem[] {
    return this.remoteCatalog;
  }

  /**
   * 폰트 로드 및 메타데이터 추출 (로컬 썸네일 생성 포함)
   */
  public async extractMetadata(filePath: string): Promise<{
    originalName: string;
    previewDataUrl: string;
  }> {
    const fileBuffer = await fs.readFile(filePath);
    return this.extractMetadataFromBuffer(
      fileBuffer,
      path.basename(filePath, path.extname(filePath)),
    );
  }

  /**
   * opentype.js v2의 플랫폼별 names 구조({unicode,macintosh,windows})에서 표시
   * 이름을 추출한다. v1의 평탄 접근(fullName/fontFamily × ko/en) 우선순위를
   * 보존하며, @types/opentype.js가 아직 v1이라 unknown으로 받아 접근한다.
   */
  private pickFontName(names: unknown): string | undefined {
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

  /**
   * Buffer로부터 메타데이터 및 실시간 미리보기 추출 (가져오기 마법사 최적화)
   */
  public async extractMetadataFromBuffer(
    buffer: Buffer,
    fallbackName: string = "Unknown Font",
  ): Promise<{
    originalName: string;
    previewDataUrl: string;
  }> {
    return new Promise((resolve, reject) => {
      try {
        const font = opentype.parse(
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ),
        );

        // 이름 추출 (v2 플랫폼별 names 대응, fullName 우선)
        const originalName = this.pickFontName(font.names) || fallbackName;

        // 실시간 미리보기 생성
        const previewDataUrl = this.generateFontThumbnail(font);

        resolve({
          originalName,
          previewDataUrl,
        });
      } catch (err) {
        logger.error(`Failed to parse font buffer for metadata`, err);
        reject(new Error("유효하지 않은 폰트 데이터입니다."));
      }
    });
  }

  /**
   * opentype.js를 활용하여 폰트 실물에서 SVG 썸네일 생성 (동적 크기 계산 적용)
   */
  private generateFontThumbnail(font: opentype.Font): string {
    try {
      const text = "Path Of Exile - 패스 오브 액자일";
      const fontSize = 32; // 조금 더 크게

      // 1. 텍스트 너비 및 박스 계산
      const advanceWidth = font.getAdvanceWidth(text, fontSize);
      const margin = 20;
      const width = Math.max(500, Math.ceil(advanceWidth + margin * 2));

      // 폰트의 상하 한계점 확인 (잘림 방지)
      const ascender = font.ascender || font.tables.os2.sTypoAscender;
      const descender = font.descender || font.tables.os2.sTypoDescender;
      const unitsPerEm = font.unitsPerEm;

      const realHeight = ((ascender - descender) / unitsPerEm) * fontSize;
      const height = Math.max(80, Math.ceil(realHeight + margin * 2));

      // 베이스라인 위치 조정 (중앙 정렬 유도)
      const x = margin;
      const y = Math.ceil((ascender / unitsPerEm) * fontSize + margin / 2);

      const pathData = font.getPath(text, x, y, fontSize);
      const svgPath = pathData.toSVG(2);

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="transparent" />
        ${svgPath.replace('fill="black"', 'fill="white"')}
      </svg>`;

      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    } catch (err) {
      logger.warn("Failed to generate dynamic font thumbnail", err);
      return "";
    }
  }

  private async addFontInternal(
    options: AddFontOptions & { overrideOriginalName?: string },
  ): Promise<CustomFontData> {
    const {
      filePath,
      customAlias,
      previewDataUrl,
      remoteSourceId,
      overrideOriginalName,
    } = options;
    await this.initPromise;
    if (!filePath) throw new Error("유효하지 않은 파일 경로입니다.");

    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`파일에 접근할 수 없습니다: ${filePath}`);
    }

    // [v2] opentype.js v2는 load(path, cb)를 제거 → 버퍼를 읽어 parse.
    // 버퍼는 파싱과 해시(ID)에 공용으로 재사용한다.
    const fileBuffer = await fs.readFile(filePath);
    let font: opentype.Font;
    try {
      font = opentype.parse(
        fileBuffer.buffer.slice(
          fileBuffer.byteOffset,
          fileBuffer.byteOffset + fileBuffer.byteLength,
        ),
      );
    } catch (err) {
      logger.error(`Failed to parse font file: ${filePath}`, err);
      throw new Error("폰트 데이터를 파싱할 수 없습니다.", { cause: err });
    }

    // 한글 지원 체크
    if (
      !font.charToGlyph("가")?.unicode &&
      font.charToGlyph("가")?.index === 0
    ) {
      throw new Error("한글(KR) 글리프를 지원하지 않는 폰트입니다.");
    }

    // [v15] 이름 추출 로직 고도화: 스타일 정보가 포함된 fullName 우선
    const originalName =
      overrideOriginalName || this.pickFontName(font.names) || "Unknown Font";

    // [v15] 중복 체크 기준을 '해시(ID)'로 변경
    // 이름(originalName)이 같더라도 해시가 다르면 다른 폰트(Bold 등)로 허용
    const id = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    const existing = this.fontsMap.get(id);
    if (existing) {
      logger.info(`Font with hash '${id.substring(0, 8)}' already exists.`);
      throw new Error(
        `동일한 내용의 폰트('${originalName}')가 이미 라이브러리에 등록되어 있습니다.`,
      );
    }

    const extension = path.extname(filePath).toLowerCase();
    const newFileName = `${id}${extension}`;
    const destPath = path.join(this.customFontsDir, newFileName);

    await fs.copyFile(filePath, destPath);

    // [v14] 서버 프리뷰가 있더라도 로컬에서 직접 추출한 썸네일을 우선 사용
    const localPreview = this.generateFontThumbnail(font);

    const now = Date.now();
    const data: CustomFontData = {
      id,
      alias: customAlias || originalName, // 카탈로그에서 온 경우 이미 fullName이 alias로 주입됨
      fileName: newFileName,
      originalName,
      previewDataUrl: localPreview || previewDataUrl || "",
      previewVersion: 2,
      createdAt: now,
      updatedAt: now,
      remoteSourceId: remoteSourceId || undefined,
    };
    await this.saveFontMetadata(data);
    return data;
  }

  /**
   * 새 폰트 등록 (Public)
   */
  public async addFont(
    filePath: string,
    previewDataUrl?: string,
    customAlias?: string,
    remoteSourceId?: string | null,
  ) {
    return await this.addFontInternal({
      filePath,
      previewDataUrl,
      customAlias,
      remoteSourceId,
    });
  }

  private async loadFontsFromDisk() {
    try {
      const files = await fs.readdir(this.customFontsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const content = await fs.readFile(
            path.join(this.customFontsDir, file),
            "utf-8",
          );
          const data = JSON.parse(content) as CustomFontData;

          this.fontsMap.set(data.id, data);
        }
      }

      // 로드 완료 후 디스크 정리 수행
      this.cleanupOrphanedFiles();
    } catch (err) {
      logger.error(`Error loading fonts from disk: ${err}`);
    }
  }

  private async saveFontMetadata(data: CustomFontData) {
    const filePath = path.join(this.customFontsDir, `${data.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    this.fontsMap.set(data.id, data);
    this.notifyRenderer();
  }

  private notifyRenderer() {
    import("electron").then(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send("font:updated");
      });
    });
  }

  /**
   * 통합 폰트 리스트 조회 (UI용)
   */
  public async getUnifiedFonts(): Promise<UnifiedFontData[]> {
    await this.initPromise;
    const appliedStore =
      (getConfig("appliedFonts") as Record<string, string>) || {};
    const pm = PowerShellManager.getInstance();
    const unknownFontsInfo: { service: string; path: string }[] = [];

    // 실제 커스텀 폰트가 적용된 service만 외부 감지를 스킵한다.
    // "DEFAULT"/null/미설정(=기본값 상태)은 오히려 외부 수동 설치를
    // 감지해야 하는 상황이므로 스캔 대상에 포함해야 한다.
    // (기존 `!appliedStore[service]`는 "DEFAULT"가 truthy라 감지를
    //  통째로 스킵하던 버그)
    const servicesToCheck = Object.entries(TARGET_SERVICES_CONFIG).filter(
      ([service]) => {
        const applied = appliedStore[service];
        return !applied || applied === "DEFAULT";
      },
    );

    if (servicesToCheck.length > 0) {
      const checkScript = servicesToCheck
        .flatMap(([service, targets]) => {
          // 감지·제거가 동일 확장 목록을 쓰도록 공유 헬퍼 사용
          // (Book/non-Book 불일치 비대칭 버그 방지)
          const extendedTargets = expandTargetNames(targets);

          return extendedTargets.map((t) => {
            const name = `${t} (TrueType)`;
            return `
$p1 = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
$p2 = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
if (Get-ItemProperty -Path $p1 -Name "${name}" -ErrorAction SilentlyContinue) {
    $val = (Get-ItemProperty -Path $p1 -Name "${name}")."${name}"
    Write-Output "FOUND:${service}:$val"
} elseif (Get-ItemProperty -Path $p2 -Name "${name}" -ErrorAction SilentlyContinue) {
    $val = (Get-ItemProperty -Path $p2 -Name "${name}")."${name}"
    Write-Output "FOUND:${service}:$val"
}
`.trim();
          });
        })
        .join("; ");

      const res = await pm.execute(checkScript, false, true);
      const output = res.stdout;

      output.split("\n").forEach((rawLine) => {
        const line = rawLine.trim();
        if (line.startsWith("FOUND:")) {
          const parts = line.split(":");
          if (parts.length >= 3) {
            const service = parts[1];
            const path = parts.slice(2).join(":").trim();
            unknownFontsInfo.push({ service, path });
          }
        }
      });
    }

    const baseFonts: UnifiedFontData[] = Array.from(this.fontsMap.values()).map(
      (f) => {
        const appliedServices = Object.entries(appliedStore)
          .filter(([_, id]) => id === f.id)
          .map(([svc]) => svc);
        // 모든 커스텀/원격 폰트는 isDefault를 false로 강제하여 관리 자유도 보장
        return { ...f, appliedServices, isDefault: false };
      },
    );

    // 기본값 항목 추가
    const defaultAppliedServices = Object.entries(appliedStore)
      .filter(([_, id]) => id === "DEFAULT" || id === null)
      .map(([svc]) => svc);

    // 만약 특정 서비스에 할당된 폰트가 없다면 해당 서비스는 기본값에 추가됨
    const allServices = Object.keys(TARGET_SERVICES_CONFIG);
    allServices.forEach((s) => {
      if (!appliedStore[s] && !defaultAppliedServices.includes(s)) {
        defaultAppliedServices.push(s);
      }
    });

    baseFonts.unshift({
      id: "DEFAULT",
      alias: "기본값",
      originalName: "System Standard",
      fileName: "",
      previewDataUrl: "",
      previewVersion: 1,
      createdAt: 0,
      updatedAt: 0,
      isDefault: true,
      appliedServices: defaultAppliedServices,
    } as UnifiedFontData);

    if (unknownFontsInfo.length > 0) {
      unknownFontsInfo.forEach((info) => {
        baseFonts.push({
          id: `UNKNOWN_SYSTEM_FONT_${info.service}`,
          alias: `외부 설치 폰트 (${info.service})`,
          originalName: info.path,
          fileName: "",
          previewDataUrl: "",
          previewVersion: 1,
          createdAt: 0,
          updatedAt: 0,
          isDefault: false,
          isUnknown: true,
          appliedServices: [info.service],
        } as UnifiedFontData);
      });
    }

    return baseFonts.sort((a, b) => {
      // 가상 항목인 DEFAULT(기본값)를 항상 최상단에 배치
      if (a.id === "DEFAULT") return -1;
      if (b.id === "DEFAULT") return 1;
      return b.createdAt - a.createdAt;
    });
  }

  /**
   * 별명 수정
   */
  public async updateAlias(id: string, newAlias: string): Promise<void> {
    await this.initPromise;
    const data = this.fontsMap.get(id);
    if (!data) return;

    // [고도화] 별칭 중복 고유성 제한 해제
    data.alias = newAlias;
    data.updatedAt = Date.now();
    await this.saveFontMetadata(data);
  }

  /**
   * 현재 적용된 커스텀 폰트를 그대로 재변조·재설치한다.
   * 크기 보정(scale) 설정이 바뀐 뒤 호출하면 새 scale로 다시 만들어진다.
   * 적용된 커스텀 폰트가 없으면 아무 작업도 하지 않는다.
   */
  public async reapplyAppliedFonts(): Promise<void> {
    await this.initPromise;
    const assignments = this.getActiveCustomAssignments();
    if (Object.keys(assignments).length === 0) return;
    // scale 변경 등으로 fontId는 같아도 변조 결과가 달라지므로 중복 가드 우회.
    await this.applyBatch(assignments, { force: true });
  }

  /** appliedFonts 중 DEFAULT가 아닌 실제 커스텀 폰트 할당만 추린다. */
  private getActiveCustomAssignments(): Record<string, string> {
    const applied = (getConfig("appliedFonts") as Record<string, string>) || {};
    return Object.fromEntries(
      Object.entries(applied).filter(
        ([, fontId]) => fontId && fontId !== "DEFAULT",
      ),
    );
  }

  private cleanupOrphanedManagedSystemFonts(): void {
    if (this.systemFontCleanupPromise) return;

    this.systemFontCleanupPromise = this.runOrphanedManagedSystemFontCleanup()
      .catch((err) => {
        logger.warn(`Managed system font cleanup skipped: ${err}`);
      })
      .finally(() => {
        this.systemFontCleanupPromise = null;
      });
  }

  private async runOrphanedManagedSystemFontCleanup(): Promise<void> {
    const managedTargetNames = Array.from(
      new Set(Object.values(TARGET_SERVICES_CONFIG).flat()),
    );
    const registryTargetNames = Array.from(
      new Set(expandTargetNames(managedTargetNames)),
    );
    const ttfFileNames = managedTargetNames.map(
      (targetName) => `${targetName.replace(/\s+/g, "")}.ttf`,
    );

    await PowerShellManager.getInstance().cleanupOrphanedManagedFontFiles(
      ttfFileNames,
      registryTargetNames,
    );
  }

  private async assertNoGameBlockingFontUpdate(): Promise<void> {
    const blockingStatus = getAllGameStatuses().find((statusState) =>
      isLaunchBlockingStatus(statusState.status),
    );
    if (blockingStatus) {
      throw new Error(
        `게임 실행 중에는 폰트를 업데이트할 수 없습니다. 먼저 게임을 종료해 주세요. (${blockingStatus.gameId} / ${blockingStatus.serviceId})`,
      );
    }

    const processes = await getProcessesInfo([
      ...FONT_UPDATE_BLOCKING_PROCESSES,
    ]);
    const blockingProcess = processes.find((process) =>
      FONT_UPDATE_BLOCKING_PROCESSES.some(
        (name) => name.toLowerCase() === process.name.toLowerCase(),
      ),
    );
    if (!blockingProcess) return;

    throw new Error(
      `게임 프로세스가 실행 중이라 폰트를 업데이트할 수 없습니다. 먼저 게임을 완전히 종료해 주세요. (${blockingProcess.name}, PID ${blockingProcess.pid})`,
    );
  }

  /**
   * 부팅 시 호출. 폰트 변조 스키마 마이그레이션 상태를 판정한다.
   *
   * - 적용된 커스텀 폰트가 없으면: 마이그레이션 불필요. 스키마만 최신으로
   *   기록하고 prompt=false (설정 없을 때 schema 찐빠 방지의 핵심).
   * - 설치된 폰트의 스키마가 현재보다 낮으면: prompt=true (사용자 확인 후
   *   completeFontMigration 호출 필요).
   */
  public async checkFontMigration(): Promise<{ prompt: boolean }> {
    await this.initPromise;
    this.cleanupOrphanedManagedSystemFonts();

    const hasCustom = Object.keys(this.getActiveCustomAssignments()).length > 0;

    if (!hasCustom) {
      // 설치된 커스텀 폰트가 없으면 마이그레이션 대상 자체가 없다.
      // 스키마만 최신으로 맞춰 다음 부팅에 불필요한 검사를 피한다.
      setConfigWithEvent("fontMutationSchema", FONT_MUTATION_SCHEMA);
      return { prompt: false };
    }

    const schema = Number(getConfig("fontMutationSchema")) || 1;
    return { prompt: schema < FONT_MUTATION_SCHEMA };
  }

  /**
   * 사용자가 재적용을 확인했을 때 호출. 재변조·재설치 성공 시에만
   * 스키마를 기록한다(멱등성: 실패 시 다음 부팅에 다시 안내).
   */
  public async completeFontMigration(): Promise<void> {
    await this.initPromise;
    await this.reapplyAppliedFonts();
    setConfigWithEvent("fontMutationSchema", FONT_MUTATION_SCHEMA);
  }

  /**
   * 일괄 적용 (Batch Apply)
   *
   * `options.force=true` 면 동일 fontId 중복 가드를 우회해 항상 재변조·재설치.
   * scale 변경 후 재적용처럼 fontId는 같지만 변조 결과가 달라지는 케이스용.
   */
  public async applyBatch(
    assignments: Record<string, string | null>,
    options?: { force?: boolean },
  ): Promise<void> {
    await this.initPromise;
    await this.assertNoGameBlockingFontUpdate();
    const pm = PowerShellManager.getInstance();
    const currentApplied =
      (getConfig("appliedFonts") as Record<string, string>) || {};

    const currentLang = (getConfig("language") as string) || "ko";

    for (const [service, fontId] of Object.entries(assignments)) {
      const targetNames =
        TARGET_SERVICES_CONFIG[service as keyof typeof TARGET_SERVICES_CONFIG];

      if (!fontId || fontId === "DEFAULT") {
        for (const targetName of expandTargetNames(targetNames)) {
          const ttfFileName = targetName.replace(/\s+/g, "") + ".ttf";
          await pm.removeSystemFont(targetName, ttfFileName);
        }
        delete currentApplied[service];
        continue;
      }

      if (!options?.force && fontId === currentApplied[service]) continue;

      const data = this.fontsMap.get(fontId);
      if (!data) {
        // [New] 로컬에 없지만 원격 카탈로그에 있는 폰트인지 확인
        const remoteItem = this.remoteCatalog.find(
          (item) => item.id === fontId,
        );
        if (remoteItem) {
          const defaultAlias =
            remoteItem.fullNames[currentLang] ||
            remoteItem.fullNames.en ||
            remoteItem.id;
          logger.info(
            `Requested font ${defaultAlias} is remote. Starting automatic download...`,
          );
          const success = await this.syncEngine.downloadFont(
            remoteItem,
            (progress) => {
              // 렌더러로 진행률 브로드캐스트
              import("electron").then(({ BrowserWindow }) => {
                BrowserWindow.getAllWindows().forEach((win) => {
                  if (!win.isDestroyed())
                    win.webContents.send("font:download-progress", {
                      id: remoteItem.id,
                      progress,
                    });
                });
              });
            },
          );
          if (success) {
            // [v11] 서버 ID를 remoteSourceId로 전달하여 등록
            const downloadedPath = path.join(
              this.customFontsDir,
              remoteItem.fileName,
            );
            try {
              await this.addFontInternal({
                filePath: downloadedPath,
                previewDataUrl: this.syncEngine.getPreviewUrl(
                  remoteItem.previewPath,
                ),
                customAlias: defaultAlias,
                remoteSourceId: remoteItem.id,
              });
            } catch (err) {
              logger.error(`Failed to integrate downloaded font: ${err}`);
            }
          } else {
            logger.error(
              `Automatic download failed for ${defaultAlias}. Skipping assignment.`,
            );
            continue;
          }
        } else {
          continue;
        }
      }

      // 갱신된 맵에서 다시 가져옴
      const fontData = this.fontsMap.get(fontId);
      if (!fontData) continue;

      const sourcePath = path.join(this.customFontsDir, fontData.fileName);

      for (const targetName of targetNames) {
        const rule = FONT_MUTATION_DEFINITIONS[targetName];
        if (!rule) {
          logger.error(`No mutation rule found for target: ${targetName}`);
          continue;
        }

        const tempPath = path.join(
          app.getPath("temp"),
          `poe2_${targetName.replace(/\s+/g, "_")}_${randomUUID().slice(0, 8)}.ttf`,
        );

        const scale = this.resolveFontScale(targetName);
        const mutatedBuffer = await this.mutateFontName(
          sourcePath,
          rule,
          scale,
        );
        await fs.writeFile(tempPath, Buffer.from(mutatedBuffer));

        const ttfFileName = targetName.replace(/\s+/g, "") + ".ttf";
        const success = await pm.installSystemFont(
          tempPath,
          targetName,
          ttfFileName,
        );
        if (!success)
          logger.error(`Failed to install ${targetName} for ${service}`);

        fs.unlink(tempPath).catch(() => {});
      }
      currentApplied[service] = fontId;
    }

    setConfigWithEvent("appliedFonts", currentApplied);
    this.notifyRenderer();
    logger.info("Batch Font Apply completed.");
  }

  /**
   * 원격 폰트 다운로드 후 로컬 라이브러리에 설치 (통합 워크플로우 전용)
   */
  public async downloadAndInstallRemoteFont(
    item: RemoteFontItem,
    customAlias?: string,
  ): Promise<CustomFontData> {
    await this.initPromise;

    // [v15] 카탈로그의 상세 이름을 별칭으로 주입 (스타일 정보 보존)
    const currentLang = (getConfig("language") as string) || "ko";
    const resolvedAlias =
      customAlias ||
      item.fullNames[currentLang] ||
      item.fullNames["en"] ||
      item.familyNames[currentLang] ||
      item.familyNames["en"] ||
      item.id;

    try {
      logger.info(`Starting intentional download for '${resolvedAlias}'...`);

      // 1. 파일 다운로드
      const success = await this.syncEngine.downloadFont(item, (progress) => {
        this.notifyDownloadProgress(item.id, progress);
      });

      if (!success) {
        throw new Error(`폰트 다운로드에 실패했습니다: ${resolvedAlias}`);
      }

      const downloadedPath = path.join(this.customFontsDir, item.fileName);

      // [v14] 객체 기반 파라미터 전달로 순서 오인 사태 방지
      const result = await this.addFontInternal({
        filePath: downloadedPath,
        customAlias: customAlias || resolvedAlias, // 사용자가 입력한 별칭 우선, 없으면 서버 별칭
        remoteSourceId: item.id,
      });

      // addFontInternal이 새로운 UUID 파일명으로 복사본을 만들었으므로 원본 삭제 가능
      if (downloadedPath !== path.join(this.customFontsDir, result.fileName)) {
        await fs.unlink(downloadedPath).catch(() => {});
      }

      logger.info(
        `Remote font '${result.alias}' successfully integrated into library.`,
      );
      return result;
    } catch (err) {
      logger.error(`Failed to download and install remote font: ${err}`);
      throw err;
    }
  }

  /**
   * 시스템 전체에서 변조된 가능성이 있는 타겟 폰트들을 전수 조사하여 상세 정보 반환
   */
  public async detectExternalFontsDetail(): Promise<DetectedExternalFont[]> {
    await this.initPromise;
    const pm = PowerShellManager.getInstance();
    const detectedMap = new Map<string, DetectedExternalFont>();

    // 1. 모든 서비스와 타켓에 대해 전수 조사
    for (const [service, targets] of Object.entries(TARGET_SERVICES_CONFIG)) {
      for (const targetName of targets) {
        const nameInRegistry = `${targetName} (TrueType)`;
        const script = `
          $p1 = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
          $p2 = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
          if (Get-ItemProperty -Path $p1 -Name "${nameInRegistry}" -ErrorAction SilentlyContinue) {
            (Get-ItemProperty -Path $p1 -Name "${nameInRegistry}")."${nameInRegistry}"
          } elseif (Get-ItemProperty -Path $p2 -Name "${nameInRegistry}" -ErrorAction SilentlyContinue) {
            (Get-ItemProperty -Path $p2 -Name "${nameInRegistry}")."${nameInRegistry}"
          }
        `.trim();

        const res = await pm.execute(script, false, true);
        const output = res.stdout.trim();
        if (!output) continue;

        let fullPath = output;
        if (!path.isAbsolute(output)) {
          fullPath = path.join(
            process.env.windir || "C:\\Windows",
            "Fonts",
            output,
          );
        }

        try {
          await fs.access(fullPath);
          const fileBuffer = await fs.readFile(fullPath);
          const hash = crypto
            .createHash("sha256")
            .update(fileBuffer)
            .digest("hex");

          // 해시 기반 집계
          const existing = detectedMap.get(hash);

          if (existing) {
            if (!existing.sourceServices.includes(service)) {
              existing.sourceServices.push(service);
            }
          } else {
            // 메타데이터 및 프리뷰 실시간 추출 (Buffer 재사용으로 성능 최적화)
            const meta = await this.extractMetadataFromBuffer(
              fileBuffer,
              targetName,
            );

            detectedMap.set(hash, {
              path: fullPath,
              hash,
              sourceServices: [service],
              originalName: meta.originalName,
              previewDataUrl: meta.previewDataUrl,
            });
          }
        } catch {
          // 접근 불가 혹은 파일 없음 (무시)
        }
      }
    }

    return Array.from(detectedMap.values());
  }

  /**
   * 사용자가 선택한 외부 폰트들을 라이브러리에 등록하고 시스템을 정화 및 초기화
   */
  public async importSelectedExternalFonts(
    selection: ImportSelection[],
  ): Promise<void> {
    await this.initPromise;
    const pm = PowerShellManager.getInstance();
    logger.info(`Starting interactive import for ${selection.length} fonts...`);

    // [Step 1] 런처 설정 전체 초기화 (DEFAULT로 원점 회귀)
    const currentApplied =
      (getConfig("appliedFonts") as Record<string, string>) || {};
    for (const serviceId of Object.keys(TARGET_SERVICES_CONFIG)) {
      currentApplied[serviceId] = "DEFAULT";
    }
    setConfigWithEvent("appliedFonts", currentApplied);

    // [Step 2] 선택된 폰트 라이브러리 등록 (사용자 지정 별칭 및 이름 반영)
    for (const sel of selection) {
      try {
        await this.addFontInternal({
          filePath: sel.path,
          customAlias: sel.alias,
          overrideOriginalName: sel.originalName, // [v15.2] 사용자가 수정한 원본 이름 반영
        });
      } catch (err: unknown) {
        // 이미 존재하는 해시인 경우 등 예외 발생 시 에러 메시지 확인 후 계속 진행
        const error = err as Error;
        if (!error.message?.includes("이미 라이브러리에 등록")) {
          throw error;
        }
      }
    }

    // [Step 3] 시스템 완전 정화 (모든 타겟 소거, Book/non-Book 변형 포함)
    const allTargets = Array.from(
      new Set(expandTargetNames(Object.values(TARGET_SERVICES_CONFIG).flat())),
    );
    for (const targetName of allTargets) {
      const ttfFileName = targetName.replace(/\s+/g, "") + ".ttf";
      await pm.removeSystemFont(targetName, ttfFileName);
    }

    // [Step 4] 런처 상태 물리적 동기화 (기본값 재작성)
    await this.applyBatch({}); // 빈 할당 전달 시 DEFAULT로 전체 재설치 수행됨

    logger.info("Interactive Import and System Purification completed.");
    this.notifyRenderer();
  }

  /**
   * 다운로드 진행률 알림 헬퍼
   */
  private notifyDownloadProgress(id: string, progress: number) {
    import("electron").then(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed())
          win.webContents.send("font:download-progress", { id, progress });
      });
    });
  }

  /**
   * 전체 폰트 목록 조회
   */
  public async getFonts(): Promise<CustomFontData[]> {
    await this.initPromise;
    return Array.from(this.fontsMap.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  public async removeFont(id: string): Promise<void> {
    await this.initPromise;
    const data = this.fontsMap.get(id);
    if (!data) return;

    try {
      // 1. [시스템 언인스톨] 해당 폰트가 현재 서비스에 할당되어 있는지 확인
      const currentApplied =
        (getConfig("appliedFonts") as Record<string, string>) || {};
      const rollbackAssignments: Record<string, string | null> = {};

      for (const [service, fontId] of Object.entries(currentApplied)) {
        if (fontId === id) {
          rollbackAssignments[service] = "DEFAULT";
          logger.info(
            `Font '${id}' is in use by '${service}'. Triggering automatic rollback to DEFAULT via applyBatch.`,
          );
        }
      }

      // 2. [로직 재사용] 할당된 서비스가 있다면 applyBatch를 호출하여 물리적 제거 및 레지스트리 롤백 수행
      if (Object.keys(rollbackAssignments).length > 0) {
        await this.applyBatch(rollbackAssignments);
      }

      // 3. [최종 물리 삭제] 런처 내부의 물리 파일 및 메타데이터 삭제
      await fs.unlink(path.join(this.customFontsDir, data.fileName));
      await fs.unlink(path.join(this.customFontsDir, `${data.id}.json`));
    } catch (err) {
      logger.error(
        `Failed to fully remove font or cleanup system assignments: ${err}`,
      );
    }

    this.fontsMap.delete(id);
    this.notifyRenderer();
  }

  public openCustomFontsFolder(): void {
    import("electron").then((electron) =>
      electron.shell.openPath(this.customFontsDir),
    );
  }

  /**
   * 외부 설치된 폰트를 라이브러리로 가져오기 (Import)
   */
  public async importExternalFont(service: string): Promise<boolean> {
    await this.initPromise;
    const targets =
      TARGET_SERVICES_CONFIG[service as keyof typeof TARGET_SERVICES_CONFIG];
    if (!targets) throw new Error(`지원하지 않는 서비스입니다: ${service}`);

    const pm = PowerShellManager.getInstance();
    let detectedPath: string | null = null;
    let targetNameForCleanup: string | null = null;

    // 1. 레지스트리 경로 재검사 및 획득 (Book/non-Book 변형 포함)
    for (const t of expandTargetNames(targets)) {
      const name = `${t} (TrueType)`;
      const script = `
        $p1 = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
        $p2 = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
        if (Get-ItemProperty -Path $p1 -Name "${name}" -ErrorAction SilentlyContinue) {
          (Get-ItemProperty -Path $p1 -Name "${name}")."${name}"
        } elseif (Get-ItemProperty -Path $p2 -Name "${name}" -ErrorAction SilentlyContinue) {
          (Get-ItemProperty -Path $p2 -Name "${name}")."${name}"
        }
      `.trim();
      const res = await pm.execute(script, false, true);
      const output = res.stdout.trim();
      if (output) {
        detectedPath = output;
        targetNameForCleanup = t;
        break;
      }
    }

    if (!detectedPath || !targetNameForCleanup) {
      throw new Error(`시스템에서 ${service}용 외부 폰트를 찾을 수 없습니다.`);
    }

    // 파일명이 아니라 전체 경로인 경우 처리
    let fullPath = detectedPath;
    if (!path.isAbsolute(detectedPath)) {
      fullPath = path.join(
        process.env.windir || "C:\\Windows",
        "Fonts",
        detectedPath,
      );
    }

    try {
      // 2. 라이브러리에 등록
      const fontData = await this.addFont(fullPath);

      // 3. 기존 외부 설치본 제거
      const ttfFileName = targetNameForCleanup.replace(/\s+/g, "") + ".ttf";
      await pm.removeSystemFont(targetNameForCleanup, ttfFileName);

      // 4. 추출된 폰트로 정식 적용
      await this.applyBatch({ [service]: fontData.id });

      return true;
    } catch (err) {
      logger.error(`Failed to import external font for ${service}: ${err}`);
      throw err;
    }
  }

  /**
   * 외부 설치된 모든 폰트 강제 정리 및 전체 설정 초기화 (Universal Cleanup)
   */
  public async cleanupExternalFont(_service: string): Promise<void> {
    await this.initPromise;
    const pm = PowerShellManager.getInstance();
    logger.info("Starting universal system font cleanup and reset...");

    // 1. 모든 서비스 타겟 전수 소거
    const allTargets = Array.from(
      new Set(expandTargetNames(Object.values(TARGET_SERVICES_CONFIG).flat())),
    );
    for (const t of allTargets) {
      const ttfFileName = t.replace(/\s+/g, "") + ".ttf";
      await pm.removeSystemFont(t, ttfFileName);
    }

    // 2. 모든 런처 설정 DEFAULT로 원점 회귀
    const currentApplied =
      (getConfig("appliedFonts") as Record<string, string>) || {};
    for (const serviceId of Object.keys(TARGET_SERVICES_CONFIG)) {
      currentApplied[serviceId] = "DEFAULT";
    }
    setConfigWithEvent("appliedFonts", currentApplied);

    // 3. 시스템 물리적 동기화
    await this.applyBatch({});

    logger.info("Universal cleanup completed.");
    this.notifyRenderer();
  }

  private async cleanupOrphanedFiles(): Promise<void> {
    await this.initPromise;
    const keptFiles: string[] = [];

    this.fontsMap.forEach((f) => {
      if (f.fileName) keptFiles.push(f.fileName);
      keptFiles.push(`${f.id}.json`);
    });

    await this.syncEngine.clearOrphaned(keptFiles);
  }

  /**
   * 타겟 폰트의 크기 보정 % 를 설정에서 읽어 50~150 범위로 클램프.
   * 설정 없거나 metrics 미적용 타겟이면 기본 100.
   */
  private resolveFontScale(targetName: string): number {
    const key = FONT_SCALE_CONFIG_KEY[targetName];
    if (!key) return FONT_SCALE_DEFAULT;
    const raw = getConfig(key) as number | undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return FONT_SCALE_DEFAULT;
    }
    return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(raw)));
  }

  private async mutateFontName(
    filePath: string,
    rule: FontMutationRule,
    scale: number,
  ): Promise<ArrayBuffer> {
    // sfnt scaler가 OTTO이면 CFF 컨테이너 → OtfMutatorWorker.
    // 그 외(0x00010000 등)는 TrueType → FontMutatorWorker.
    // 두 워커 모두 SFNT 패치 방식으로 glyph/레이아웃 보조 테이블을 보존한다.
    const headHandle = await fs.open(filePath, "r");
    let isOTF: boolean;
    try {
      const head = Buffer.alloc(4);
      await headHandle.read(head, 0, 4, 0);
      isOTF = head.toString("ascii") === "OTTO";
    } finally {
      await headHandle.close();
    }
    const workerName = isOTF ? "OtfMutatorWorker.js" : "FontMutatorWorker.js";

    return new Promise((resolve, reject) => {
      // [Production] Base path for unpacked workers (Standard Case)
      let workerPath = path.join(
        app.getAppPath(),
        "..",
        "app.asar.unpacked",
        "dist-electron",
        "workers",
        workerName,
      );

      if (!app.isPackaged) {
        // [Development] Adjacent to main bundle in dist-electron
        workerPath = path.join(__dirname, "workers", workerName);
      }

      const worker = new Worker(workerPath);
      worker.postMessage({ filePath, rule, scale });
      worker.on(
        "message",
        (msg: { success: boolean; buffer: ArrayBuffer; error?: string }) => {
          if (msg.success) resolve(msg.buffer);
          else reject(new Error(msg.error || "Mutation failed"));
          worker.terminate();
        },
      );
      worker.on("error", (err: Error) => {
        reject(err);
        worker.terminate();
      });
    });
  }
}
