# PoE/PoE2 `Content.ggpk` 직접 증분 업데이트 조사

> 작성일: 2026-07-30 · 상태: 조사 완료 · 브랜치:
> `fix/update-download-request-feedback`

## 조사 목적

예약 패치에서 공식 게임 클라이언트를 화면에 표시하지 않고 업데이트하기 위한
대안으로 다음 가능성을 조사했다.

- 현재 WebRoot/CDN에서 실행 파일만 직접 내려받을 수 있는가
- `Content.ggpk` 전체가 아니라 변경된 데이터만 직접 반영할 수 있는가
- 이를 이미 구현한 공개 라이브러리 또는 완성형 오픈소스 패처가 있는가

이번 범위는 공개 자료와 공개 소스에 대한 정적 조사뿐이다. 라이브러리 도입,
프로토타입 구현, 게임 파일 변경 및 실동작 검증은 수행하지 않았다.

## 결론

조사 범위에서는 **현재 PoE/PoE2 설치를 최신 공식 버전으로 완전히 동기화하는
제품 수준의 오픈소스 대체 패처를 찾지 못했다.**

다만 필요한 하위 기능은 각각 공개돼 있다.

1. 공식 PoE2 패치 CDN에서 최신 버전의 논리 파일과 번들을 찾고 내려받는 코드
2. `Content.ggpk`, `Bundles2/*.bundle.bin`, `Bundles2/_.index.bin`을
   읽고 수정하는 코드
3. 선택한 GGPK 파일을 패치 서버의 사본으로 복구하는 PoE1 선례

따라서 기술적으로 조합은 가능해 보이지만, 공개된 구성 요소를 그대로 연결하면
공식 패처와 동등한 업데이트 엔진이 되는 것은 아니다. 원격/로컬 상태 비교,
필요 데이터 판정, 중단 복구, 원자적 반영, 무결성 검증, 실행 파일 자체 교체까지
별도로 해결해야 한다.

현재 예약 패치의 목표만 놓고 보면 직접 GGPK 패처를 소유하기보다 공식 패처를
비가시적으로 실행하는 경로를 안정화하는 쪽이 위험과 유지보수 부담이 작다.

## `Content.ggpk`와 번들 구조

PoE는 3.11.2부터 기존의 단일 자산 배치에서 다중 번들 기반 배치로 전환했다.

- Steam판은 다수의 `*.bundle.bin` 파일을 별도 파일로 둔다.
- Standalone판은 같은 번들을 `Content.ggpk` 내부의 GGPK `FILE` 레코드로
  보관한다.
- `Bundles2/_.index.bin`은 논리 파일의 이름 해시를 실제 번들, offset,
  size에 연결한다.
- 각 번들은 Oodle로 압축된 블록들로 구성된다. 공개 분석 문서에서 일반적인
  비압축 블록 크기는 256 KiB로 설명하지만, 블록 경계와 논리 파일 경계는
  일치하지 않는다.

따라서 `Content.ggpk` 전체를 다시 내려받지 않고 업데이트하는 것은 구조상
가능하다. 그러나 논리 파일 하나를 단순 URL로 받아 같은 위치에 덮어쓰는 문제는
아니다. 최신 인덱스와 대상 번들의 압축 데이터를 함께 해석하고, GGPK 내부
레코드와 번들 인덱스를 일관되게 갱신해야 한다.

근거:

- [poe-tool-dev — Bundle scheme](https://github.com/poe-tool-dev/ggpk.discussion/wiki/Bundle-scheme)

## 공개 구현 조사

### 1. LibGGPK3

[LibGGPK3](https://github.com/aianlinb/LibGGPK3)는 조사 대상 중 로컬 쓰기
기능이 가장 직접적이다.

- `LibGGPK3`: `Content.ggpk` 처리
- `LibBundle3`: 별도 `*.bundle.bin` 처리
- `LibBundledGGPK3`: Standalone판의 GGPK 내부 번들 처리
- 라이선스: AGPL-3.0
- 저장소가 명시한 제약:
  - 같은 GGPK를 대상으로 한 완전한 thread safety를 보장하지 않음
  - 라이브러리 업데이트 간 forward compatibility를 보장하지 않음

`PatchBundledGGPK3` 예제는 ZIP의 논리 파일 경로를 찾아
`LibBundle3.Index.Replace()`로 교체하고 인덱스를 저장한다.

- [PatchBundledGGPK3 예제](https://github.com/aianlinb/LibGGPK3/blob/main/Examples/PatchBundledGGPK3/Program.cs)
- [Index.Replace 구현](https://github.com/aianlinb/LibGGPK3/blob/main/LibBundle3/Index.cs)

중요한 차이는 이 교체 기능이 공식 업데이트 동기화가 아니라는 점이다.
현재 `LibBundle3`의 쓰기 경로는 변경 데이터를 원래 공식 번들에 그대로
재구성하기보다 `Bundles2/LibGGPK3/*` 이름의 커스텀 번들에 기록하고 논리
파일 매핑을 그쪽으로 변경한다. 이는 모드·번역 패치에는 적합하지만, 최신 공식
설치와 동일한 레이아웃을 재현하는 패처라고 볼 수 없다.

### 2. VisualGGPK2

[VisualGGPK2](https://github.com/aianlinb/VisualGGPK2)는 Windows용 GGPK
뷰어·편집기이며, README에 패치 서버로부터 파일을 복구하는 기능이 명시돼
있다. 현재는 신규 개발을 중단하고 버그 수정만 유지하며, 개발·학습 용도에는
LibGGPK3 사용을 권장한다.

공개된 복구 코드에서는 다음 동작을 확인할 수 있다.

- PoE1 로그인 서버의 패치 프로토콜로 현재 patch root를 얻는다.
- 최신 `Bundles2/_.index.bin`을 내려받는다.
- 일반 GGPK `FILE` 레코드는 `PatchServer + 상대경로`에서 데이터를 직접
  내려받아 교체한다.
- 번들 내부 논리 파일은 원격 인덱스의 bundle index, offset, size로 로컬
  매핑을 갱신한다.

확인한 코드 경로에는 그 매핑이 가리키는 최신 번들 본문 전체를 내려받고,
로컬 설치 전체의 누락 상태를 비교·복구하는 절차가 없다. 따라서 선택 파일
복구의 선례는 되지만 완성형 업데이트 엔진은 아니다.

- [VisualGGPK2 복구 구현](https://github.com/aianlinb/VisualGGPK2/blob/master/VisualGGPK2/MainWindow.xaml.cs#L1059-L1141)

또한 이 코드는 PoE1 패치 서버 프로토콜을 사용한 구현이다. 현재 PoE2의
WebRoot 탐색과 업데이트 동작이 동일하다고 간주할 수는 없다.

### 3. `@poe2-toolkit/ggpk`

[poe2-toolkit의 `@poe2-toolkit/ggpk`](https://github.com/rajtik76/poe2-toolkit/tree/main/packages/poe2-ggpk)는
PoE2 공식 CDN 접근 쪽이 가장 직접적이다.

- 기본 CDN은 `https://patch-poe2.poecdn.com`
- 지정한 패치 버전에서 논리 GGPK 경로를 번들 데이터로 해석
- 필요한 raw file과 sprite를 요청 시점에 내려받음
- 동일 번들의 동시 요청을 하나로 병합
- 다운로드한 번들을 패치 버전별로 캐시
- 임시 파일과 rename을 사용해 캐시 파일을 원자적으로 게시
- 라이선스: MIT

그러나 목적은 게임 데이터 추출기용 read/cache 계층이다. 로컬 게임 설치의
`Content.ggpk` 또는 `_.index.bin`을 수정하지 않는다.

### 4. 읽기·추출 전용 도구

다음 공개 도구도 GGPK와 번들을 해석하지만 업데이트 쓰기 기능은 제공하지
않는다.

- [ex-nihil/ggpk](https://github.com/ex-nihil/ggpk): Rust 기반 GGPK
  reader/extractor
- [juddisjudd/ggpk-tool](https://github.com/juddisjudd/ggpk-tool):
  PoE2 GGPK 및 번들 탐색·추출

## 직접 업데이트 방식별 판정

### 실행 파일과 상위 파일 직접 다운로드

가능한 방식이다. VisualGGPK2의 PoE1 복구 코드도 GGPK 상위의 일반 파일을
patch root의 상대경로로 직접 내려받는다.

다만 최신 실행 파일을 먼저 배치하는 것만으로 게임 데이터 업데이트가 완료되는
것은 아니다. 실행 파일 교체 시에는 실행 중인 프로세스, 파일 잠금, self-update,
버전 불일치 상태도 처리해야 한다.

### 선택한 논리 자산만 교체

LibGGPK3으로 가능하다. 하지만 기본 쓰기 모델은 커스텀 번들을 추가하고 인덱스
매핑을 바꾸는 형태라 공식 설치와 동일한 업데이트 결과를 보장하지 않는다.

### 필요한 공식 번들만 내려받아 최신 상태로 동기화

구조상 가능하고 `@poe2-toolkit/ggpk`가 원격 번들 획득의 선례를 제공한다.
그러나 다음을 모두 수행하는 공개 완성형 구현은 찾지 못했다.

1. 현재 PoE2 patch version/WebRoot 확정
2. 로컬 `Content.ggpk`와 원격 `_.index.bin`의 차이 계산
3. 변경된 논리 파일이 참조하는 번들·압축 블록 판정
4. 필요한 CDN 데이터 다운로드 및 Oodle 처리
5. GGPK `FILE`/`FREE` 레코드와 `_.index.bin`의 일관된 갱신
6. exe/DLL 등 GGPK 외부 파일 동기화
7. 중단·전원 종료·디스크 부족 시 복구 또는 rollback
8. 최종 무결성 및 버전 검증

## 관찰과 추론의 경계

### 공개 소스에서 직접 확인한 사실

- Standalone판은 `Content.ggpk` 안에 번들을 보관한다.
- 논리 파일 위치는 `Bundles2/_.index.bin`이 소유한다.
- LibGGPK3은 논리 파일 교체와 인덱스 저장을 지원한다.
- VisualGGPK2에는 PoE1 패치 서버 기반의 선택 파일 복구 코드가 있다.
- `@poe2-toolkit/ggpk`는 PoE2 공식 CDN에서 필요한 번들을 가져와 캐시한다.
- 조사한 프로젝트 중 설치 전체를 최신 상태로 만드는 완성형 패처는 없었다.

마지막 항목은 “존재하지 않는다”는 절대적 증명이 아니라, 2026-07-30에
GitHub 공개 저장소와 관련 프로젝트를 검색한 범위에서 찾지 못했다는 뜻이다.

### 추가 검증이 필요한 추론

- CDN reader와 GGPK writer를 조합하면 별도 패처를 만들 수는 있어 보인다.
- 공식 패처가 네트워크에서 사용하는 정확한 최소 다운로드 단위는 공개 번들
  구조만으로 확정할 수 없다.
- PoE1 VisualGGPK2의 patch-root 조회 프로토콜을 현재 PoE2에 그대로 적용할
  수 있다고 볼 근거는 없다.
- 커스텀 번들 방식의 파일 교체 후 다음 공식 패치가 어떤 정리·재다운로드 동작을
  하는지는 별도 실험 없이는 단정할 수 없다.

## 위험과 유지보수 비용

- GGPK 또는 인덱스가 부분적으로만 갱신되면 설치 전체가 부팅 불가능해질 수 있다.
- Oodle 압축 처리에는 네이티브 런타임과 배포·라이선스 검토가 필요하다.
- LibGGPK3/VisualGGPK2는 AGPL-3.0이므로 실제 제품 결합 전 라이선스 의무를
  검토해야 한다.
- 게임 패치마다 해시나 번들 형식이 바뀔 수 있고 LibGGPK3도 forward
  compatibility를 보장하지 않는다.
- 공식 패처의 자체 복구, 재시도, 무결성 확인을 직접 구현하면 런처가 게임
  설치 무결성까지 소유하게 된다.

## 예약 패치에 대한 판단

직접 GGPK 업데이트는 “창을 숨기기 위한 작은 우회”가 아니라 공식 패치 엔진의
상당 부분을 재구현하는 별도 제품 범위다. 현재 목표에 대한 우선순위는 다음이
합리적이다.

1. 공식 게임 패처를 비가시·비포커스 상태로 실행할 수 있는 경로 유지
2. 필요한 경우 exe/DLL 선갱신으로 공식 패처의 self-restart 노출 최소화
3. 직접 GGPK 업데이트는 공식 패처의 숨김 실행이 구조적으로 불가능하다고
   확인된 경우에만 별도 설계·위험 검토

이 판단은 구현 승인이 아니며, 이번 조사에서 저장소 코드 또는 게임 파일을
변경하지 않았다.
