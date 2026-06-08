# 개발자 게시판 Roadmap 공지 템플릿 및 주입 자동화

## 배경

런처의 개발자 게시판은 GitHub Pages의 `notice/list.json`과 `notice/*.md`를 읽는다.
Roadmap 공지를 별도로 직접 편집하면 `docs/Roadmap.md`, GitHub Issue #7, 개발자 게시판 공지가 서로 달라지기 쉽다.

## 원칙

- `docs/Roadmap.md`가 Roadmap 체크리스트의 단일 원본이다.
- 개발자 게시판용 Roadmap 공지는 `docs/roadmap/developer-roadmap-notice.template.md` 템플릿에서 생성한다.
- 템플릿의 주입 지점은 아래 주석으로 표시한다.
  - `<!-- roadmap-notice:inject-start -->`
  - `<!-- roadmap-notice:inject-end -->`
- 주입 구간에는 `docs/Roadmap.md`에서 생성한 체크리스트만 들어간다.
- `([ref](...))` 링크와 `issue-sync:omit` 블록은 개발자 공지에 포함하지 않는다.

## 현재 구현

- `scripts/build-roadmap-notice.cjs`
  - Roadmap 체크리스트를 템플릿 주입 구간에 넣어 개발자 공지 md를 생성한다.
  - `--output`으로 출력 경로를 지정할 수 있다.
- `.github/workflows/sync-roadmap-notice.yml`
  - `master` 브랜치에서 Roadmap 공지 생성에 필요한 파일이 변경되면 실행된다.
  - 생성된 md를 `gh-pages` 브랜치의 `notice/roadmap.md`로 교체한다.
- `.github/workflows/automate-notice-list.yml`
  - `gh-pages` 브랜치에서 `notice/roadmap.md` 변경을 감지해 `notice/list.json`을 재생성한다.
- `npm run roadmap:notice`
  - 로컬에서 개발자 공지용 Roadmap md를 확인할 때 사용한다.

## 구현 체크포인트

- [x] 개발자 공지 Roadmap 템플릿 추가
- [x] Roadmap 체크리스트 주입 지점 주석 추가
- [x] Roadmap 공지 생성 스크립트 추가
- [x] gh-pages `notice/roadmap.md` 갱신 workflow 추가
