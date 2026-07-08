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
- [x] ~~opentype.js v2 정리: `@types/opentype.js` 제거 검토~~ → **유지 결정 (2026-07-08).**
      opentype.js@2.0.0은 자체 타입 미번들(package.json `types`/`typings` 필드 없음,
      패키지 내 `.d.ts` 0개) → 제거 시 opentype.js가 완전 untyped(implicit any). v1
      타입이 v2 API를 유효해 보이게 하는 오인 위험은 opentype-v2-contract 테스트 +
      ESM 로드 가드(#237/#238)로 보완됨. 소스 변경 없음, `build:check` 이미 green.
- [x] ~~FontManager 폰트명 추출(`pickFontName`)을 순수 함수로 추출 + 우선순위 엣지
      단위 테스트~~ → **완료 (#239, 2026-07-08).** `src/main/services/pickFontName.ts`로
      분리, `pickFontName.test.ts` 엣지 10건(우선순위·폴스루·부재·플랫폼-바깥 판별). 동작 무변경.
- [x] ~~FontManager `generateFontThumbnail`의 `replace('fill="black"', …)` dead code
      정리~~ → **완료 (#239, 2026-07-08).** v2 `toSVG`는 fill 생략(`0196b3a`·v1부터 dead)
      → 제거 + 소비처 보정 계약 주석화 + opentype-v2-contract에 fill 생략 계약 고정.
