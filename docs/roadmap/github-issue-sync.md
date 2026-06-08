# Roadmap 문서와 GitHub Issue #7 동기화 자동화

## 배경

로드맵을 GitHub Issue와 별도 문서로 관리하면 한쪽이 쉽게 stale 상태가 된다.
관리 원본은 `docs/Roadmap.md`로 두고, GitHub Issue #7은 외부 공개용 체크리스트 뷰로 자동 갱신한다.

## 원칙

- `docs/Roadmap.md`가 단일 원본이다.
- 상세 기획은 `docs/roadmap/` 하위 문서로 분리한다.
- `docs/Roadmap.md`의 체크리스트 항목 오른쪽에는 `([ref](roadmap/file.md))` 형식으로 상세 문서 링크를 붙일 수 있다.
- GitHub Issue #7에 동기화할 때는 ref 링크와 문서 전용 안내 블록을 제거한다.

## 동기화 규칙

동기화 스크립트는 다음을 제거한 뒤 Issue 본문을 만든다.

- `<!-- issue-sync:omit-start -->`부터 `<!-- issue-sync:omit-end -->`까지의 문서 전용 블록
- 체크리스트 오른쪽의 `([ref](...))` 링크

GitHub Actions는 `docs/Roadmap.md`, `docs/roadmap/**`, 동기화 스크립트 또는 workflow가 변경되면 실행한다.
수동 동기화도 `workflow_dispatch`로 가능해야 한다.

## 현재 구현

- `scripts/build-roadmap-issue-body.cjs`
  - `docs/Roadmap.md`를 읽어 GitHub Issue 본문을 생성한다.
  - `([ref](...))` 링크와 `issue-sync:omit` 블록을 제거한다.
- `.github/workflows/sync-roadmap-issue.yml`
  - `master` 브랜치에서 로드맵 관련 파일이 변경되면 실행된다.
  - `workflow_dispatch`로 수동 실행할 수 있다.
  - 생성된 본문을 `gh issue edit 7 --body-file`로 Issue #7에 반영한다.
- `npm run roadmap:issue-body`
  - 로컬에서 Issue 반영 전 본문을 확인할 때 사용한다.

## 구현 체크포인트

- [x] Issue body 생성 스크립트 추가
- [x] Roadmap 변경 시 Issue #7을 갱신하는 GitHub Actions workflow 추가
- [x] GitHub Issue에는 상세 ref 없이 체크리스트만 표시되는지 검증
