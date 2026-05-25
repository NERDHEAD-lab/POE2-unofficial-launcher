import { describe, it, expect } from "vitest";

import { fetchMasterWebRoot } from "../utils/version-sources/masterSocket";

/**
 * Integration: 실제 PoE master patch server에 TCP 연결해서 응답을 검증한다.
 * 네트워크가 막혀있거나 GGG 측 master 호스트/포트/프로토콜이 바뀌면 fail한다.
 *
 * 도메인 화이트리스트는 일부러 안 건다 — 호출 위치(국가)에 따라 GGG global CDN
 * (patch.poecdn.com / patch-poe2.poecdn.com)이나 카카오 CDN
 * (poe.gdn.gamecdn.net / patch.poe2.kakaogames.com)으로 라우팅이 갈리고,
 * 미래에 GGG가 CDN 도메인을 바꿔도 회귀로 잡고 싶지 않다.
 *
 * 검증 포인트:
 *   1. 응답을 받는다 (timeout 안 남)
 *   2. webRoot가 http(s) URL 형태
 *   3. URL 마지막 path segment가 `\d+(\.\d+)+` 패턴 (= 버전)
 *   4. 응답 시간 5초 이내
 */

const VERSION_PATTERN = /^\d+(\.\d+)+$/;

function assertWebRoot(webRoot: string): void {
  expect(webRoot).toMatch(/^https?:\/\//);
  const url = new URL(webRoot);
  const segments = url.pathname.split("/").filter(Boolean);
  expect(segments.length).toBeGreaterThan(0);
  const lastSegment = segments[segments.length - 1];
  expect(lastSegment).toMatch(VERSION_PATTERN);
}

describe("fetchMasterWebRoot (live)", () => {
  it("fetches a valid webRoot for POE1", async () => {
    const started = Date.now();
    const result = await fetchMasterWebRoot("POE1", { timeoutMs: 5000 });
    const elapsed = Date.now() - started;
    console.log(`POE1 master response (${elapsed}ms):`, result.webRoot);
    assertWebRoot(result.webRoot);
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it("fetches a valid webRoot for POE2", async () => {
    const started = Date.now();
    const result = await fetchMasterWebRoot("POE2", { timeoutMs: 5000 });
    const elapsed = Date.now() - started;
    console.log(`POE2 master response (${elapsed}ms):`, result.webRoot);
    assertWebRoot(result.webRoot);
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);
});
