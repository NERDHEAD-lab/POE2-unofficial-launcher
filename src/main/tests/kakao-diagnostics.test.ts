// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  formatKakaoDiagnostic,
  KakaoDiagnosticLimiter,
  parseKakaoDiagnostic,
  summarizeKakaoDiagnosticUrl,
} from "../../shared/kakao-diagnostics";
import { KakaoChallengeGate } from "../kakao/cloudflare-challenge";
import { DiagnosticLogStore } from "../services/DiagnosticLogStore";

describe("exportable Kakao diagnostics", () => {
  it("preserves every return to a state when security and visibility states alternate", () => {
    const limiter = new KakaoDiagnosticLimiter();
    for (let i = 0; i < 20; i++) {
      expect(
        limiter.include("security.state", {
          webContentsId: 1,
          state: i % 2 ? "user-required" : "auto-progress",
        }),
      ).toBe(1);
      expect(
        limiter.include("visibility.observed", {
          webContentsId: 1,
          reason: i % 2 ? "show" : "hide",
        }),
      ).toBe(1);
    }
  });
  it("keeps only known URL routes and never credentials, queries, fragments or unknown paths", () => {
    expect(
      summarizeKakaoDiagnosticUrl(
        "https://user:secret@security-center.kakaogames.com/auth?code=secret#secret",
      ),
    ).toBe("https://security-center.kakaogames.com/auth");
    expect(
      summarizeKakaoDiagnosticUrl(
        "https://security-center.kakaogames.com/secret/account",
      ),
    ).toBe("https://security-center.kakaogames.com/[other]");
    expect(
      summarizeKakaoDiagnosticUrl("kakaogamestarter://secret?code=secret"),
    ).toBe("kakaogamestarter:");
    expect(summarizeKakaoDiagnosticUrl("https://secret.example/secret")).toBe(
      "https:[other]",
    );
    expect(summarizeKakaoDiagnosticUrl("secret")).toBe("[invalid]");
  });

  it("normalizes fields before logs reach console, IPC or disk", () => {
    const content = formatKakaoDiagnostic("ipc.rejected", {
      receivedDocumentId: 7,
      gateDocumentId: 8,
      reason: "document-mismatch",
      url: "https://security-center.kakaogames.com/auth?unknown=SECRET#SECRET",
      password: "SECRET",
      html: "SECRET",
      error: "SECRET",
      handler: "SECRET",
    });
    expect(content).not.toContain("SECRET");
    expect(parseKakaoDiagnostic(content)).toMatchObject({
      event: "ipc.rejected",
      receivedDocumentId: 7,
      gateDocumentId: 8,
      reason: "document-mismatch",
    });
    expect(parseKakaoDiagnostic("ordinary log")).toBeNull();
    expect(parseKakaoDiagnostic('[KakaoDiag] {"event":"SECRET"}')).toBeNull();
  });

  it("bounds repeated records while retaining changed documents and reasons", () => {
    const limiter = new KakaoDiagnosticLimiter();
    let count = 0;
    for (let i = 0; i < 1000; i++)
      if (
        limiter.include("ipc.rejected", {
          webContentsId: 1,
          receivedDocumentId: 7,
          reason: "document-mismatch",
        })
      )
        count++;
    expect(count).toBeLessThan(15);
    expect(
      limiter.include("ipc.rejected", {
        webContentsId: 1,
        receivedDocumentId: 8,
        reason: "document-mismatch",
      }),
    ).toBe(1);
    expect(
      limiter.include("ipc.rejected", {
        webContentsId: 1,
        receivedDocumentId: 8,
        reason: "document-uncommitted",
      }),
    ).toBe(1);
    limiter.forget(1);
    expect(
      limiter.include("ipc.rejected", {
        webContentsId: 1,
        receivedDocumentId: 7,
        reason: "document-mismatch",
      }),
    ).toBe(1);
  });

  it("reports the uncommitted document and ignored failure without changing gate acceptance", () => {
    const gate = new KakaoChallengeGate(vi.fn());
    gate.setTrigger(1, "GAME_START_POE2");
    gate.commit(1, "https://security-center.kakaogames.com/auth");
    const documentId = gate.pageState(1).documentId;
    expect(gate.diagnosticState(1, documentId).reason).toBe("accepted");
    gate.beginNavigation(1);
    expect(gate.diagnosticState(1, documentId)).toMatchObject({
      reason: "document-uncommitted",
      gateDocumentId: null,
      committedDocumentId: documentId,
      requestId: null,
    });
    gate.requestFailed({ id: 100, webContentsId: 1 });
    expect(gate.accepts(1, documentId)).toBe(false);
    gate.requestStarted({
      id: 101,
      webContentsId: 1,
      url: "https://security-center.kakaogames.com/auth",
      resourceType: "mainFrame",
    });
    gate.requestFailed({ id: 101, webContentsId: 1 });
    expect(gate.diagnosticState(1, documentId).reason).toBe("accepted");
    expect(gate.accepts(1, documentId)).toBe(true);
    expect(gate.diagnosticState(1, 999).reason).toBe("document-mismatch");
  });

  it("survives the existing log-store export with parseable correlation fields", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "kakao-diagnostic-test-"));
    try {
      const now = new Date(2026, 8, 5, 12).getTime();
      const store = new DiagnosticLogStore({ now: () => now });
      store.initialize(dir, []);
      const content = formatKakaoDiagnostic("ipc.rejected", {
        runId: "boot-123",
        appVersion: "1.7.1",
        taskId: 1,
        webContentsId: 2,
        receivedDocumentId: 3,
        gateDocumentId: null,
        reason: "document-uncommitted",
      });
      store.append({
        type: "GENERAL",
        content,
        timestamp: now,
        isError: false,
      });
      const append = (
        target: DiagnosticLogStore,
        event: string,
        fields: Record<string, unknown>,
      ) =>
        target.append({
          type: "GENERAL",
          content: formatKakaoDiagnostic(event, fields),
          timestamp: now,
          isError: false,
        });
      append(store, "account.result", {
        runId: "boot-123",
        accountResult: "account-confirmed",
        nickname: "SECRET",
      });
      append(store, "session.save", {
        runId: "boot-123",
        saveTrigger: "relaunch",
        saveResult: "saved",
        profilePath: "SECRET",
      });
      const next = new DiagnosticLogStore({ now: () => now });
      next.initialize(dir, []);
      append(next, "account.result", {
        runId: "boot-456",
        accountResult: "account-confirmed",
        accountId: "SECRET",
      });
      const exported = next.createDateSnapshot(now)!;
      const lines = exported.segments.flatMap((segment) =>
        segment.content.toString("utf8").trim().split("\n"),
      );
      expect(lines.join("")).not.toContain("SECRET");
      const records = lines.map((line) =>
        parseKakaoDiagnostic(JSON.parse(line).content),
      );
      expect(records).toEqual([
        expect.objectContaining({
          runId: "boot-123",
          taskId: 1,
          receivedDocumentId: 3,
          gateDocumentId: null,
        }),
        {
          v: 1,
          event: "account.result",
          runId: "boot-123",
          accountResult: "account-confirmed",
        },
        {
          v: 1,
          event: "session.save",
          runId: "boot-123",
          saveTrigger: "relaunch",
          saveResult: "saved",
        },
        {
          v: 1,
          event: "account.result",
          runId: "boot-456",
          accountResult: "account-confirmed",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
