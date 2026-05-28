# PR-2: PoBLocator 실제 구현 + 통합

> 상위 문서: [../pob-integration-plan.md](../pob-integration-plan.md)
> 선행 PR: [PR-1](PR-1.md) (mock locator, modal UI)
> 후속 PR: [PR-3](PR-3.md) (BuildListView)

## 목표

PR-1 의 mock locator 를 **실제 레지스트리 조회 + 폴더 검증** 으로 교체. 사용자 머신에서 PoB 자동 감지.

## 종료 기준

- [ ] launcher 기존 [src/main/utils/registry.ts](../../src/main/utils/registry.ts) 의 `readRegistryValue` / `normalizePath` 재사용
- [ ] `getPobInstallPath()` 함수가 HKCU → HKLM 순으로 조회, 따옴표 trim, normalize
- [ ] 결과를 `electron-store` 의 `pob.installLocation` 에 24h TTL 캐시
- [ ] 사용자 머신 (G:\ 설치본) 에서 자동 감지 성공 → InstallerModal 안 뜸
- [ ] PoB 미설치 머신 또는 키 수동 삭제 시 → InstallerModal 정상 fallback
- [ ] vitest 단위 테스트 (registry mock 으로 HKCU 만 / HKLM 만 / 둘 다 부재 / 따옴표 포함 케이스)

## 작업 항목

### 1. `getPobInstallPath()` 함수 추가

- 파일: [../../src/main/utils/registry.ts](../../src/main/utils/registry.ts) (편집)
- 추가 위치: `getGameInstallPath()` 함수 아래 (148-157 라인 부근)
- 구현:

  ```ts
  const POB_REGISTRY_PATHS = [
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Path of Building Community (PoE2)",
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Path of Building Community (PoE2)",
  ] as const;

  export const getPobInstallPath = async (): Promise<{
    installLocation: string | null;
    source: "HKCU" | "HKLM" | null;
  }> => {
    for (const regPath of POB_REGISTRY_PATHS) {
      const raw = await readRegistryValue(regPath, "InstallLocation");
      if (raw) {
        // PoC-0.3: 값이 따옴표 포함 ("G:\..." 형태)
        const unquoted = raw.replace(/^"|"$/g, "");
        const source = regPath.startsWith("HKCU") ? "HKCU" : "HKLM";
        return { installLocation: normalizePath(unquoted), source };
      }
    }
    return { installLocation: null, source: null };
  };
  ```

### 2. 폴더 무결성 검증

- 새 파일: `src/main/services/pobInstallVerifier.ts`
- 함수: `verifyPobInstallation(installLocation: string): Promise<boolean>`
- 검증 항목:
  1. `Path of Building-PoE2.exe` 존재 확인
  2. `lua51.dll`, `lua-utf8.dll`, `lcurl.dll`, `socket.dll`, `lzip.dll`, `zlib1.dll` 존재
  3. `Modules/Build.lua` 존재 (Lua 코어가 실제로 들어있는지)
- 하나라도 빠지면 false → InstallerModal 재표시

### 3. PR-1 의 mock 제거

- `src/main/services/pobLauncher.ts` (PR-1 작성) 의 mock 호출 → 실제 `getPobInstallPath()` + `verifyPobInstallation()` 사용
- electron-store 캐시 우선, TTL 만료 시 재조회

### 4. electron-store TTL 캐시 헬퍼

- 새 파일 또는 store 확장: `src/main/utils/cachedStore.ts`
- 패턴:
  ```ts
  // get: 캐시가 24h 이내면 반환, 아니면 null
  await getCached<{ installLocation: string }>("pob.installLocation");
  await setCached("pob.installLocation", value, 24 * 60 * 60 * 1000);
  ```

### 5. vitest 단위 테스트

- 파일: `src/main/utils/registry.test.ts` (신규 또는 기존 확장)
- 케이스:
  - HKCU 에만 있음 → 정상 반환, source: "HKCU"
  - HKLM 에만 있음 → HKCU fallback 후 정상 반환
  - 둘 다 없음 → null
  - 값에 따옴표 포함 → trim 후 반환
  - PowerShellManager mock

## 결정 사항 (plan §6 에서 참조)

- **Q3**: 기존 registry.ts 재사용, 의존성 0 추가
- **PoC-0.3 결과**: 사용자 머신 (G:\ 설치본) 에서 HKCU 만, 따옴표 포함 — 실증됨

## 검증 시나리오

1. `npm run dev` 실행
2. POB i18n 버튼 클릭 → 자동 감지 성공 → InstallerModal **안 뜸**
3. 콘솔 로그에 `[PoBLocator] InstallLocation: G:\Path of Building Community (PoE2) (source: HKCU)` 출력
4. electron-store 에 `pob.installLocation` 저장 확인 (`%APPDATA%/<launcher>/config.json`)
5. 캐시 무효화 후 24h 강제 (시간 mock) → 재조회 동작 확인
6. 레지스트리 키 수동 삭제 (백업 후) → InstallerModal 재표시 → 수동 경로 지정 흐름 동작

## 마일스톤

PR-1 + PR-2 머지 시 진입 인프라 완성. 사용자 머신에서 PoB 자동 감지 동작.

## 참고

- launcher 기존 registry 패턴: [../../src/main/utils/registry.ts:148-157](../../src/main/utils/registry.ts#L148-L157) (`getGameInstallPath`)
- PowerShellManager: [../../src/main/utils/powershell.ts](../../src/main/utils/powershell.ts)
