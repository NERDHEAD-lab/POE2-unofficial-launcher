# AGENTS-ROADMAP.md — 개발 내부 로드맵 (마일스톤 + DoD + 검증)

> 에이전트·개발 내부용 엔지니어링 로드맵: 개발 도구, 빌드/CI, 리팩토링,
> 기술부채, 에이전트 워크플로. 사용자에게 보이는 제품 로드맵은
> `docs/Roadmap.md`(CI가 Issue #7·gh-pages 공지로 동기화)가 별도로 담당한다.
> 이 파일은 CI와 무관하며 공개 채널에 노출되지 않는다. 라우팅 규칙:
> `.agents/skills/roadmap-capture/SKILL.md`.

## 백로그

- [ ] husky pre-commit: WSL 감지 시 lint-staged를 Windows pwsh로 위임
      — DoD: WSL에서 `git commit`이 `--no-verify` 없이 통과 / 검증: WSL 실커밋
      1회 `[WSL]` + Windows 커밋 회귀 없음 `[Windows-pwsh]`.
      의사코드: `docs/archive/2026-05-20-residual-work.md` §2.5.
- [ ] opentype.js v2 정리: v2 자체 타입 번들 여부 확인 → 번들 시
      `@types/opentype.js@^1.3.3` 제거(현재 잔존; v1 타입이 `opentype.load`를 유효해
      보이게 만들어 v2 no-op 스텁을 가림). 미번들이면 유지. — DoD: `build:check`
      green 유지 / 검증: `[Windows-pwsh]`. (2026-07 renovate 배치 F2)
- [ ] FontManager 폰트명 추출(`pickFontName`)을 순수 함수로 추출 + 우선순위 엣지
      단위 테스트(macintosh-only ko, fontFamily 폴백, names 부재 등). 현재는 실폰트
      계약 테스트(`opentype-v2-contract.integration.test.ts`)만 존재. — 검증:
      `npm test` `[Windows-pwsh]`.
- [ ] FontManager `generateFontThumbnail`의 `replace('fill="black"', …)` dead code
      정리(opentype v2 `toSVG`는 기본 fill 속성을 생략). — 다음 폰트 작업 시.
- [ ] `scripts/generate-font-assets.ts`의 `RemoteFontItem` 인터페이스가
      `displayNames`를 선언하나 코드는 `fullNames`/`familyNames`를 출력(배포
      스키마와 일치하는 쪽은 코드). tsx는 타입을 벗겨 무해하나 향후 `scripts/`
      타입체크 도입 시 즉시 에러 — 인터페이스를 실출력에 맞추거나 scripts를
      tsconfig에 편입. (2026-07 Fable5 후속 리뷰)
- [ ] opentype.js ESM footgun: 순수 Node ESM `import('opentype.js')`에서 `parse`가
      undefined(UMD main + exports map 부재). `automate-font-list` 러너를 ESM(예:
      `node --experimental-strip-types`)으로 바꾸면 조용히 파손 — 현 tsx CJS 경로는
      무관. 러너 변경 시 명시 검증. (위 opentype 정리 항목 연관)
