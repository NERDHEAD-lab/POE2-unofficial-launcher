import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { Font } from "fonteditor-core";

/**
 * [Phase 0] 통합 폰트 생애주기 테스트 스크립트
 *
 * 기능:
 * 1. Kodia 원본을 타겟 메타데이터(Spoqa 등)로 변조하여 생성.
 * 2. 생성된 폰트를 시스템(윈도우)에 설치 (PowerShell Win32 API 활용).
 * 3. 설치 상태 검증.
 * 4. 테스트 폰트 제거 및 클린업.
 */

// --- 1. 변조 규칙 상수 (Source of Truth) ---
const TARGET_RULES = {
  SPOQA: {
    family: "Spoqa Han Sans Neo",
    subfamily: "Regular",
    fullName: "Spoqa Han Sans Neo Regular",
    postScript: "SpoqaHanSansNeo-Regular",
    fileName: "SpoqaHanSansNeoRegular.ttf",
  },
  NOTO: {
    family: "Noto Sans CJK TC",
    subfamily: "Book",
    fullName: "Noto Sans CJK TC",
    postScript: "NotoSansCJKTC",
    fileName: "NotoSansCJKTCBook.ttf",
  },
};

const SOURCE_PATH = path.join(
  __dirname,
  "../packages/launcher/src/main/assets/fonts/defaults/kodia.ttf",
);
const TEST_DIR = path.join(__dirname, "../test_output");

// --- 2. 유틸리티 함수 ---

/**
 * 폰트 변조 및 생성
 */
function generateMutatedFont(key: keyof typeof TARGET_RULES) {
  const config = TARGET_RULES[key];
  console.log(`\n[1/4] 폰트 변조 시작: ${config.fullName}`);

  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`원본 소스 파일이 없습니다: ${SOURCE_PATH}`);
  }

  const buffer = fs.readFileSync(SOURCE_PATH);
  const font = Font.create(buffer, { type: "ttf" });
  const fontData = font.get();
  const name = fontData.name;

  // 메타데이터 정밀 주입 (동기화된 규칙 적용)
  name.fontFamily = config.family; // ID 1
  name.fontSubFamily = config.subfamily; // ID 2
  name.fullName = config.fullName; // ID 4
  name.postScriptName = config.postScript; // ID 6
  name.preferredFamily = config.family; // ID 16
  name.preferredSubFamily = config.subfamily; // ID 17
  name.uniqueSubFamily = `${config.postScript};${name.version}`; // ID 3

  const outputBuffer = font.write({ type: "ttf" });
  const outputPath = path.join(TEST_DIR, config.fileName);

  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);
  fs.writeFileSync(outputPath, Buffer.from(outputBuffer as ArrayBuffer));

  console.log(`✅ 변조 완료: ${outputPath}`);
  return outputPath;
}

/**
 * PowerShell 명령어 실행 (관리자 권한 필요)
 */
function runAdminPowerShell(script: string) {
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const command = `powershell -ExecutionPolicy Bypass -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -EncodedCommand ${encodedScript}'"`;
  try {
    execSync(command);
    return true;
  } catch (e) {
    console.error("❌ PowerShell 실행 실패:", e);
    return false;
  }
}

/**
 * 시스템에 폰트 설치
 */
function installFont(filePath: string, config: typeof TARGET_RULES.SPOQA) {
  console.log(`[2/4] 시스템 설치 시작... (UAC 창이 뜨면 승인해 주세요)`);

  const psScript = `
$ErrorActionPreference = "Stop"
$sourcePath = "${filePath}"
$destPath = "$env:windir\\Fonts\\${config.fileName}"
$targetFontName = "${config.family}"

# 1. 이전 폰트가 있다면 제거 (중복 방지)
if (Test-Path $destPath) { Remove-Item $destPath -Force }

# 2. 파일 복사 및 보안 차단 해제 (Win11 대응)
Copy-Item -Path $sourcePath -Destination $destPath -Force
Unblock-File -Path $destPath

# 3. 레지스트리 등록
$regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
$regName = "$targetFontName (TrueType)"
Set-ItemProperty -Path $regPath -Name $regName -Value "${config.fileName}"

# 4. Win32 API 실시간 통지
$Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern int AddFontResource(string lpszFilename);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
'@
$Win32API = Add-Type -MemberDefinition $Signature -Name "Win32API_Install" -Namespace "FontTest" -PassThru
[void]$Win32API::AddFontResource($destPath)
[void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Output "DONE"
    `;

  runAdminPowerShell(psScript);
  console.log(`✅ 설치 프로세스 완료.`);
}

/**
 * 설치 결과 검증
 */
function verifyInstallation(config: typeof TARGET_RULES.SPOQA) {
  console.log(`[3/4] 설치 검증 중...`);
  const fontInFontsDir = fs.existsSync(
    path.join(process.env.WINDIR || "C:/Windows", "Fonts", config.fileName),
  );

  // 레지스트리 체크를 위한 PS
  const checkRegScript = `(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts").'${config.family} (TrueType)'`;
  let regExists: boolean;
  try {
    const result = execSync(`powershell -Command "${checkRegScript}"`)
      .toString()
      .trim();
    regExists = result === config.fileName;
  } catch (_err) {
    regExists = false;
  }

  console.log(`- 폰트 파일 존재: ${fontInFontsDir ? "OK" : "FAILED"}`);
  console.log(`- 레지스트리 등록: ${regExists ? "OK" : "FAILED"}`);

  if (fontInFontsDir && regExists) {
    console.log(`✅ 검증 최종 통과!`);
  } else {
    console.error(`❌ 검증 실패.`);
  }
}

/**
 * 클린업 (삭제)
 */
function cleanup(config: typeof TARGET_RULES.SPOQA) {
  console.log(`[4/4] 클린업 시작... (UAC 창 승인 필요)`);
  const psScript = `
$destPath = "$env:windir\\Fonts\\${config.fileName}"
$targetFontName = "${config.family}"

$regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
$regName = "$targetFontName (TrueType)"

if (Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $regPath -Name $regName -Force
}

$Signature = @'
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern bool RemoveFontResource(string lpFileName);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
'@
$Win32API = Add-Type -MemberDefinition $Signature -Name "Win32API_Remove" -Namespace "FontTest" -PassThru
[void]$Win32API::RemoveFontResource($destPath)
[void]$Win32API::PostMessage(0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)

if (Test-Path $destPath) { Remove-Item $destPath -Force }
    `;

  runAdminPowerShell(psScript);
  console.log(`✅ 클린업 완료. 시스템이 복구되었습니다.`);
}

// --- 3. 실행 제어 ---

async function run() {
  console.log("==================================================");
  console.log("🚀 통합 폰트 생애주기 테스트 시작");
  console.log("==================================================");

  const targetKey = "SPOQA";
  const config = TARGET_RULES[targetKey];

  try {
    const testFontPath = generateMutatedFont(targetKey);
    installFont(testFontPath, config);

    // 시스템 반영을 위한 짧은 대기
    await new Promise((r) => setTimeout(r, 2000));

    verifyInstallation(config);

    console.log(
      "\n[!] 육안으로 윈도우 글꼴 설정에서 '" +
        config.family +
        "'가 보이는지 확인해 보세요.",
    );

    // 대기 후 삭제
    console.log("\n5초 후 클린업을 진행합니다...");
    await new Promise((r) => setTimeout(r, 5000));

    cleanup(config);
  } catch (e) {
    console.error(`❌ 테스트 중 오류 발생:`, e);
  }

  console.log("\n==================================================");
  console.log("🏁 모든 테스트 시나리오 종료");
  console.log("==================================================");
}

run();
