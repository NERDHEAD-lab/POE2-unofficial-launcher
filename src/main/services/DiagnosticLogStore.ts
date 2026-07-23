import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import type { DebugLogPayload } from "../../shared/types";

export const DIAGNOSTIC_LOG_RETENTION_DAYS = 14;
export const DIAGNOSTIC_LOG_SEGMENT_BYTES = 10 * 1024 * 1024;
export const DIAGNOSTIC_LOG_TOTAL_BYTES = 100 * 1024 * 1024;
export const DIAGNOSTIC_LOG_ENTRY_BYTES = 512 * 1024;

const LOG_FILE_PATTERN = /^launcher-(\d{4}-\d{2}-\d{2})\.(\d{3})\.log$/;
const REDACTION_MARKER = "[REDACTED]";

export interface DiagnosticLogStoreOptions {
  retentionDays?: number;
  segmentBytes?: number;
  totalBytes?: number;
  entryBytes?: number;
  now?: () => number;
}

interface DiagnosticLogFile {
  name: string;
  path: string;
  dateKey: string;
  segmentIndex: number;
  size: number;
}

export interface DiagnosticLogAvailability {
  dateKey: string;
  segmentCount: number;
  totalBytes: number;
}

export interface DiagnosticLogSnapshot {
  dateKey: string;
  segments: Array<{ name: string; content: Buffer }>;
  totalBytes: number;
}

export function toLocalDateKey(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function redactDiagnosticLogContent(content: string): string {
  const queryCredential =
    /([?&](?:code|token|session|access_token|refresh_token|id_token|client_secret)=)[^&#\s"'<>]*/gi;
  const quotedCredential =
    /((?:["']?(?:authorization|cookie|set-cookie|password|access_token|refresh_token|id_token|client_secret|auth_code|authorization_code|token|session)["']?)\s*[:=]\s*)(["'])(.*?)\2/gi;
  const unquotedCredential =
    /((?:authorization|cookie|set-cookie|password|access_token|refresh_token|id_token|client_secret|auth_code|authorization_code|token|session)\s*[:=]\s*)(?!\[REDACTED\])([^\s,;&}\]]+)/gi;
  const credentialHeader =
    /^(\s*(?:authorization|cookie|set-cookie)\s*:\s*).*$/gim;

  return content
    .replace(queryCredential, `$1${REDACTION_MARKER}`)
    .replace(quotedCredential, `$1$2${REDACTION_MARKER}$2`)
    .replace(unquotedCredential, `$1${REDACTION_MARKER}`)
    .replace(credentialHeader, `$1${REDACTION_MARKER}`);
}

function isValidDateKey(dateKey: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function getRetentionCutoffDateKey(
  now: number,
  retentionDays: number,
): string | null {
  if (!Number.isFinite(now) || retentionDays < 1) return null;

  const cutoff = new Date(now);
  if (Number.isNaN(cutoff.getTime())) return null;

  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  return toLocalDateKey(cutoff.getTime());
}

function serializePayload(
  payload: DebugLogPayload,
  maxBytes: number,
): Buffer | null {
  if (maxBytes < 1) return null;

  const originalContentBytes = Buffer.byteLength(payload.content, "utf8");
  const redactedContent = redactDiagnosticLogContent(payload.content);
  const encode = (content: string) =>
    Buffer.from(JSON.stringify({ ...payload, content }) + "\n", "utf8");
  const complete = encode(redactedContent);

  if (complete.byteLength <= maxBytes) return complete;

  const suffix =
    `\n[내용 절단: 원본 ${originalContentBytes} bytes, ` +
    `단일 로그 상한 ${maxBytes} bytes]`;
  let low = 0;
  let high = redactedContent.length;
  let best: Buffer | null = null;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    let end = midpoint;
    if (
      end > 0 &&
      end < redactedContent.length &&
      /[\uD800-\uDBFF]/.test(redactedContent[end - 1])
    ) {
      end -= 1;
    }

    const candidate = encode(redactedContent.slice(0, end) + suffix);
    if (candidate.byteLength <= maxBytes) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best;
}

function getOpenFlags(baseFlags: number): number {
  return baseFlags | (constants.O_NOFOLLOW ?? 0);
}

export class DiagnosticLogStore {
  private directory: string | null = null;
  private failureReported = false;
  private knownTotalBytes = 0;
  private lastCleanupDateKey: string | null = null;

  private readonly retentionDays: number;
  private readonly segmentBytes: number;
  private readonly totalBytes: number;
  private readonly entryBytes: number;
  private readonly now: () => number;

  constructor(options: DiagnosticLogStoreOptions = {}) {
    this.retentionDays =
      options.retentionDays ?? DIAGNOSTIC_LOG_RETENTION_DAYS;
    this.segmentBytes = options.segmentBytes ?? DIAGNOSTIC_LOG_SEGMENT_BYTES;
    this.totalBytes = options.totalBytes ?? DIAGNOSTIC_LOG_TOTAL_BYTES;
    this.entryBytes = options.entryBytes ?? DIAGNOSTIC_LOG_ENTRY_BYTES;
    this.now = options.now ?? Date.now;
  }

  initialize(
    directory: string,
    bootstrapLogs: readonly DebugLogPayload[],
  ): void {
    this.directory = null;
    this.failureReported = false;
    this.knownTotalBytes = 0;
    this.lastCleanupDateKey = null;

    try {
      mkdirSync(directory, { recursive: true });
      const directoryStat = lstatSync(directory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        throw new Error("Diagnostic log path is not a regular directory");
      }

      this.directory = directory;
      this.cleanup();

      for (const payload of bootstrapLogs) {
        this.append(payload);
      }
    } catch (error) {
      this.directory = null;
      this.reportFailure("initialize", error);
    }
  }

  append(payload: DebugLogPayload): void {
    if (!this.directory) return;

    try {
      const ingestionTimestamp = this.now();
      const effectiveTimestamp = Number.isFinite(payload.timestamp)
        ? payload.timestamp
        : ingestionTimestamp;
      const dateKey = toLocalDateKey(effectiveTimestamp);
      if (!dateKey) return;

      const cutoffDateKey = getRetentionCutoffDateKey(
        ingestionTimestamp,
        this.retentionDays,
      );
      if (cutoffDateKey && dateKey < cutoffDateKey) return;

      const serialized = serializePayload(
        { ...payload, timestamp: effectiveTimestamp },
        this.entryBytes,
      );
      if (!serialized) return;

      const target = this.resolveAppendTarget(dateKey, serialized.byteLength);
      this.appendFile(target.path, serialized);
      this.knownTotalBytes += serialized.byteLength;

      const todayKey = toLocalDateKey(this.now());
      if (
        this.knownTotalBytes > this.totalBytes ||
        todayKey !== this.lastCleanupDateKey
      ) {
        this.cleanup();
      }
    } catch (error) {
      this.reportFailure("append", error);
    }
  }

  getDateAvailability(timestamp: number): DiagnosticLogAvailability | null {
    const dateKey = toLocalDateKey(timestamp);
    if (!this.directory || !dateKey) return null;

    try {
      const files = this.listLogFiles().filter(
        (file) => file.dateKey === dateKey,
      );
      if (files.length === 0) return null;

      return {
        dateKey,
        segmentCount: files.length,
        totalBytes: files.reduce((total, file) => total + file.size, 0),
      };
    } catch (error) {
      this.reportFailure("get availability", error);
      return null;
    }
  }

  createDateSnapshot(timestamp: number): DiagnosticLogSnapshot | null {
    const dateKey = toLocalDateKey(timestamp);
    if (!this.directory || !dateKey) return null;

    try {
      const files = this.listLogFiles()
        .filter((file) => file.dateKey === dateKey)
        .sort((a, b) => a.segmentIndex - b.segmentIndex);
      const segments: DiagnosticLogSnapshot["segments"] = [];

      for (const file of files) {
        const content = this.readRegularFile(file.path);
        if (content) {
          segments.push({ name: file.name, content });
        }
      }

      if (segments.length === 0) return null;

      return {
        dateKey,
        segments,
        totalBytes: segments.reduce(
          (total, segment) => total + segment.content.byteLength,
          0,
        ),
      };
    } catch (error) {
      this.reportFailure("create snapshot", error);
      return null;
    }
  }

  private resolveAppendTarget(
    dateKey: string,
    incomingBytes: number,
  ): { path: string } {
    if (!this.directory) {
      throw new Error("Diagnostic log store is not initialized");
    }

    const entries = readdirSync(this.directory, { withFileTypes: true });
    let highestOccupiedIndex = -1;
    let latestRegularFile: DiagnosticLogFile | null = null;

    for (const entry of entries) {
      const match = LOG_FILE_PATTERN.exec(entry.name);
      if (!match || match[1] !== dateKey) continue;

      const segmentIndex = Number(match[2]);
      highestOccupiedIndex = Math.max(highestOccupiedIndex, segmentIndex);
      if (!entry.isFile() || entry.isSymbolicLink()) continue;

      const filePath = path.join(this.directory, entry.name);
      const stat = lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;

      if (
        !latestRegularFile ||
        segmentIndex > latestRegularFile.segmentIndex
      ) {
        latestRegularFile = {
          name: entry.name,
          path: filePath,
          dateKey,
          segmentIndex,
          size: stat.size,
        };
      }
    }

    if (
      latestRegularFile &&
      latestRegularFile.segmentIndex === highestOccupiedIndex &&
      latestRegularFile.size + incomingBytes <= this.segmentBytes
    ) {
      return { path: latestRegularFile.path };
    }

    const nextIndex = highestOccupiedIndex + 1;
    if (nextIndex > 999) {
      throw new Error(`Diagnostic log segment limit reached for ${dateKey}`);
    }

    const name = `launcher-${dateKey}.${String(nextIndex).padStart(3, "0")}.log`;
    return { path: path.join(this.directory, name) };
  }

  private appendFile(filePath: string, content: Buffer): void {
    const flags = getOpenFlags(
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND,
    );
    const descriptor = openSync(filePath, flags, 0o600);

    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) {
        throw new Error("Diagnostic log target is not a regular file");
      }

      let offset = 0;
      while (offset < content.byteLength) {
        const written = writeSync(
          descriptor,
          content,
          offset,
          content.byteLength - offset,
        );
        if (written < 1) {
          throw new Error("Diagnostic log write made no progress");
        }
        offset += written;
      }
    } finally {
      closeSync(descriptor);
    }
  }

  private readRegularFile(filePath: string): Buffer | null {
    const before = lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink()) return null;

    const descriptor = openSync(
      filePath,
      getOpenFlags(constants.O_RDONLY),
    );
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) return null;
      return readFileSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }

  private listLogFiles(): DiagnosticLogFile[] {
    if (!this.directory) return [];

    const files: DiagnosticLogFile[] = [];
    for (const entry of readdirSync(this.directory, { withFileTypes: true })) {
      const match = LOG_FILE_PATTERN.exec(entry.name);
      if (
        !match ||
        !isValidDateKey(match[1]) ||
        !entry.isFile() ||
        entry.isSymbolicLink()
      ) {
        continue;
      }

      const filePath = path.join(this.directory, entry.name);
      const stat = lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;

      files.push({
        name: entry.name,
        path: filePath,
        dateKey: match[1],
        segmentIndex: Number(match[2]),
        size: stat.size,
      });
    }

    return files.sort(
      (a, b) =>
        a.dateKey.localeCompare(b.dateKey) ||
        a.segmentIndex - b.segmentIndex,
    );
  }

  private cleanup(): void {
    if (!this.directory) return;

    const now = this.now();
    const cutoffDateKey = getRetentionCutoffDateKey(now, this.retentionDays);
    if (!cutoffDateKey) return;

    let files = this.listLogFiles();
    for (const file of files) {
      if (file.dateKey < cutoffDateKey) {
        unlinkSync(file.path);
      }
    }

    files = this.listLogFiles();
    let totalBytes = files.reduce((total, file) => total + file.size, 0);
    for (const file of files) {
      if (totalBytes <= this.totalBytes) break;
      unlinkSync(file.path);
      totalBytes -= file.size;
    }

    this.knownTotalBytes = totalBytes;
    this.lastCleanupDateKey = toLocalDateKey(now);
  }

  private reportFailure(operation: string, error: unknown): void {
    if (this.failureReported) return;

    this.failureReported = true;
    console.error(`[DiagnosticLogStore] ${operation} failed:`, error);
  }
}

export const diagnosticLogStore = new DiagnosticLogStore();
