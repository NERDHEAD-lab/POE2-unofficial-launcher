import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLogHistory,
  Logger,
  recordDebugLogPayload,
  setupDiagnosticLogSink,
  setupMainLogger,
} from "../utils/logger";
import {
  DIAGNOSTIC_LOG_ENTRY_BYTES,
  DiagnosticLogStore,
  redactDiagnosticLogContent,
  toLocalDateKey,
} from "./DiagnosticLogStore";

import type { DebugLogPayload } from "../../shared/types";
import type { AppContext, DebugLogEvent } from "../events/types";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "diagnostic-log-store-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function payload(
  content: string,
  timestamp = new Date(2026, 6, 24, 12).getTime(),
): DebugLogPayload {
  return {
    type: "TEST",
    content,
    isError: false,
    timestamp,
  };
}

function readOnlyLogFile(directory: string): string {
  const names = readdirSync(directory).filter((name) => name.endsWith(".log"));
  expect(names).toHaveLength(1);
  return readFileSync(path.join(directory, names[0]), "utf8");
}

afterEach(() => {
  setupDiagnosticLogSink(() => undefined);
  vi.restoreAllMocks();

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("DiagnosticLogStore", () => {
  it("uses the local calendar date for segment names", () => {
    const timestamp = new Date(2026, 0, 2, 0, 5).getTime();

    expect(toLocalDateKey(timestamp)).toBe("2026-01-02");
    expect(toLocalDateKey(Number.NaN)).toBeNull();
  });

  it("rotates before an entry would cross the segment byte limit", () => {
    const directory = createTemporaryDirectory();
    const store = new DiagnosticLogStore({
      segmentBytes: 220,
      entryBytes: 1_024,
      now: () => new Date(2026, 6, 24, 12).getTime(),
    });
    store.initialize(directory, []);

    store.append(payload("x".repeat(100)));
    store.append(payload("y".repeat(100)));

    expect(readdirSync(directory).sort()).toEqual([
      "launcher-2026-07-24.000.log",
      "launcher-2026-07-24.001.log",
    ]);
  });

  it("keeps fourteen local dates and deletes oldest segments over the total cap", () => {
    const retentionDirectory = createTemporaryDirectory();
    writeFileSync(
      path.join(retentionDirectory, "launcher-2026-07-10.000.log"),
      "old",
    );
    writeFileSync(
      path.join(retentionDirectory, "launcher-2026-07-11.000.log"),
      "kept",
    );

    new DiagnosticLogStore({
      now: () => new Date(2026, 6, 24, 12).getTime(),
    }).initialize(retentionDirectory, []);

    expect(
      existsSync(
        path.join(retentionDirectory, "launcher-2026-07-10.000.log"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(retentionDirectory, "launcher-2026-07-11.000.log"),
      ),
    ).toBe(true);

    const cappedDirectory = createTemporaryDirectory();
    writeFileSync(
      path.join(cappedDirectory, "launcher-2026-07-22.000.log"),
      "aaaa",
    );
    writeFileSync(
      path.join(cappedDirectory, "launcher-2026-07-23.000.log"),
      "bbbb",
    );
    writeFileSync(
      path.join(cappedDirectory, "launcher-2026-07-24.000.log"),
      "cccc",
    );

    new DiagnosticLogStore({
      totalBytes: 8,
      now: () => new Date(2026, 6, 24, 12).getTime(),
    }).initialize(cappedDirectory, []);

    expect(readdirSync(cappedDirectory).sort()).toEqual([
      "launcher-2026-07-23.000.log",
      "launcher-2026-07-24.000.log",
    ]);
  });

  it("bounds a single entry and marks the original byte size", () => {
    const directory = createTemporaryDirectory();
    const store = new DiagnosticLogStore({
      now: () => new Date(2026, 6, 24, 12).getTime(),
    });
    const oversizedContent = "x".repeat(600 * 1024);
    store.initialize(directory, []);

    store.append(payload(oversizedContent));

    const serialized = Buffer.from(readOnlyLogFile(directory));
    const stored = JSON.parse(serialized.toString("utf8")) as DebugLogPayload;
    expect(serialized.byteLength).toBeLessThanOrEqual(
      DIAGNOSTIC_LOG_ENTRY_BYTES,
    );
    expect(stored.content).toContain(
      "[내용 절단: 원본 614400 bytes, 단일 로그 상한 524288 bytes]",
    );
  });

  it("redacts credential fields, headers, and URL query credentials", () => {
    const content = [
      "Authorization: Bearer auth-secret",
      "Cookie: sid=cookie-secret",
      "Set-Cookie: refresh=cookie-response-secret",
      '{"password":"pw-secret","access_token":"access-secret","auth_code":"auth-code-secret","authorization_code":"authorization-code-secret","token":"json-token-secret","session":"json-session-secret","code":"ERR_ABORTED"}',
      "refresh_token=refresh-secret id_token=id-secret client_secret=client-secret",
      "https://example.test/callback?code=code-secret&token=token-secret&session=session-secret",
    ].join("\n");

    const redacted = redactDiagnosticLogContent(content);

    for (const secret of [
      "auth-secret",
      "cookie-secret",
      "cookie-response-secret",
      "pw-secret",
      "access-secret",
      "auth-code-secret",
      "authorization-code-secret",
      "json-token-secret",
      "json-session-secret",
      "refresh-secret",
      "id-secret",
      "client-secret",
      "code-secret",
      "token-secret",
      "session-secret",
    ]) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).toContain('"code":"ERR_ABORTED"');
    expect(redacted.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(14);
  });

  it("excludes symlinks, directories, invalid dates, and disguised names", () => {
    const directory = createTemporaryDirectory();
    const outsideFile = path.join(createTemporaryDirectory(), "outside.log");
    writeFileSync(outsideFile, "outside");
    let symlinkCreated = true;
    try {
      symlinkSync(
        outsideFile,
        path.join(directory, "launcher-2026-07-24.000.log"),
        "file",
      );
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode !== "EPERM" && errorCode !== "EACCES") throw error;
      symlinkCreated = false;
    }
    mkdirSync(path.join(directory, "launcher-2026-07-23.000.log"));
    writeFileSync(
      path.join(directory, "launcher-2026-02-30.000.log"),
      "invalid-date",
    );
    writeFileSync(
      path.join(directory, "launcher-2026-07-24.002.log.bak"),
      "disguised",
    );

    const store = new DiagnosticLogStore({
      now: () => new Date(2026, 6, 24, 12).getTime(),
    });
    store.initialize(directory, []);
    expect(store.getDateAvailability(payload("").timestamp)).toBeNull();

    store.append(payload("safe"));

    expect(
      existsSync(
        path.join(
          directory,
          symlinkCreated
            ? "launcher-2026-07-24.001.log"
            : "launcher-2026-07-24.000.log",
        ),
      ),
    ).toBe(true);
    expect(readFileSync(outsideFile, "utf8")).toBe("outside");
    expect(
      existsSync(path.join(directory, "launcher-2026-07-24.002.log.bak")),
    ).toBe(true);
  });

  it("returns regular segments in deterministic name order", () => {
    const directory = createTemporaryDirectory();
    writeFileSync(
      path.join(directory, "launcher-2026-07-24.002.log"),
      "c",
    );
    writeFileSync(
      path.join(directory, "launcher-2026-07-24.000.log"),
      "a",
    );
    writeFileSync(
      path.join(directory, "launcher-2026-07-24.001.log"),
      "b",
    );
    const store = new DiagnosticLogStore({
      now: () => new Date(2026, 6, 24, 12).getTime(),
    });
    store.initialize(directory, []);
    const timestamp = new Date(2026, 6, 24, 12).getTime();

    expect(store.getDateAvailability(timestamp)).toEqual({
      dateKey: "2026-07-24",
      segmentCount: 3,
      totalBytes: 3,
    });
    const snapshot = store.createDateSnapshot(timestamp);
    expect(snapshot?.segments.map((segment) => segment.name)).toEqual([
      "launcher-2026-07-24.000.log",
      "launcher-2026-07-24.001.log",
      "launcher-2026-07-24.002.log",
    ]);
    expect(
      snapshot?.segments.map((segment) => segment.content.toString("utf8")),
    ).toEqual(["a", "b", "c"]);
    expect(snapshot?.totalBytes).toBe(3);
  });

  it("falls back to ingestion time for an invalid payload timestamp", () => {
    const directory = createTemporaryDirectory();
    const now = new Date(2026, 6, 24, 12).getTime();
    const store = new DiagnosticLogStore({ now: () => now });
    store.initialize(directory, []);

    store.append(payload("invalid timestamp", Number.NaN));

    const stored = JSON.parse(readOnlyLogFile(directory)) as DebugLogPayload;
    expect(stored.timestamp).toBe(now);
  });

  it("does not propagate filesystem failures and reports only once", () => {
    const parentDirectory = createTemporaryDirectory();
    const invalidDirectory = path.join(parentDirectory, "not-a-directory");
    writeFileSync(invalidDirectory, "file");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Expected fail-closed diagnostic.
    });
    const store = new DiagnosticLogStore();

    expect(() => store.initialize(invalidDirectory, [])).not.toThrow();
    expect(() => store.append(payload("ignored"))).not.toThrow();
    expect(store.getDateAvailability(Date.now())).toBeNull();
    expect(store.createDateSnapshot(Date.now())).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("replays bootstrap logs once and sends each runtime payload to the sink once", () => {
    const directory = createTemporaryDirectory();
    const store = new DiagnosticLogStore({
      now: () => new Date(2026, 6, 24, 12).getTime(),
    });
    const bootstrap = payload("bootstrap");
    store.initialize(directory, [bootstrap]);
    const append = vi.spyOn(store, "append");
    setupDiagnosticLogSink((entry) => store.append(entry));
    const runtime = payload("runtime");

    recordDebugLogPayload(runtime);

    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(runtime);
    expect(getLogHistory().at(-1)).toEqual(runtime);
    const stored = readOnlyLogFile(directory);
    expect(stored.match(/bootstrap/g)).toHaveLength(1);
    expect(stored.match(/runtime/g)).toHaveLength(1);
  });

  it("isolates sink failures from logger callers", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Expected fail-closed diagnostic.
    });
    setupDiagnosticLogSink(() => {
      throw new Error("sink failed");
    });

    expect(() => recordDebugLogPayload(payload("first"))).not.toThrow();
    expect(() => recordDebugLogPayload(payload("second"))).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("records through the sink exactly once before preserving EventBus emission", () => {
    const order: string[] = [];
    setupDiagnosticLogSink(() => order.push("sink"));
    setupMainLogger({} as AppContext, (_event: DebugLogEvent) => {
      order.push("event");
    });
    const testLogger = new Logger({ type: "TEST", useConsole: false });

    testLogger.log("ordered");

    expect(order).toEqual(["sink", "event"]);
    expect(getLogHistory().at(-1)?.content).toBe("ordered");
  });
});
