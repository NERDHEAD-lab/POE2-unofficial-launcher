import net from "node:net";

import { AppConfig } from "../../../shared/types";

interface MasterEndpoint {
  host: string;
  port: number;
}

const ENDPOINTS: Record<AppConfig["activeGame"], MasterEndpoint> = {
  POE1: { host: "patch.pathofexile.com", port: 12995 },
  POE2: { host: "patch.pathofexile2.com", port: 13060 },
};

// Protocol byte sequence sent by official client and ggpker.
// 0x01 = magic, 0x07 = patch protocol version 7.
const REQUEST_BYTES = Buffer.from([0x01, 0x07]);

// Response layout: offset 34 = url length (utf-16 code points),
// offset 35 onwards = url bytes (length * 2 bytes), UTF-16LE.
const URL_LENGTH_OFFSET = 34;
const URL_BYTES_OFFSET = 35;

const DEFAULT_TIMEOUT_MS = 3000;
const MIN_RESPONSE_LENGTH = URL_BYTES_OFFSET + 2; // at least 1 utf-16 code point

export interface MasterSocketResult {
  webRoot: string;
}

export class MasterSocketError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "timeout"
      | "connection-refused"
      | "dns"
      | "short-response"
      | "empty-url"
      | "unknown",
  ) {
    super(message);
    this.name = "MasterSocketError";
  }
}

export interface FetchMasterOptions {
  timeoutMs?: number;
  // Injection seam for tests
  connect?: (host: string, port: number) => net.Socket;
}

export function fetchMasterWebRoot(
  gameId: AppConfig["activeGame"],
  opts: FetchMasterOptions = {},
): Promise<MasterSocketResult> {
  const { host, port } = ENDPOINTS[gameId];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const connectFn = opts.connect ?? ((h, p) => net.createConnection(p, h));

  return new Promise<MasterSocketResult>((resolve, reject) => {
    const socket = connectFn(host, port);
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (
      err: MasterSocketError | null,
      result?: MasterSocketResult,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else if (result) resolve(result);
    };

    const timer = setTimeout(() => {
      finish(
        new MasterSocketError(
          `master socket timeout (${timeoutMs}ms)`,
          "timeout",
        ),
      );
    }, timeoutMs);

    socket.once("connect", () => {
      socket.write(REQUEST_BYTES);
    });

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const merged = Buffer.concat(chunks);
      if (merged.length < MIN_RESPONSE_LENGTH) return;
      const urlLen = merged[URL_LENGTH_OFFSET];
      if (urlLen === 0) {
        finish(
          new MasterSocketError(
            "master returned empty url length",
            "empty-url",
          ),
        );
        return;
      }
      const needed = URL_BYTES_OFFSET + urlLen * 2;
      if (merged.length < needed) return;
      const webRoot = merged
        .subarray(URL_BYTES_OFFSET, needed)
        .toString("utf16le");
      if (!webRoot) {
        finish(
          new MasterSocketError(
            "master returned empty url string",
            "empty-url",
          ),
        );
        return;
      }
      finish(null, { webRoot });
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      const code =
        err.code === "ECONNREFUSED"
          ? "connection-refused"
          : err.code === "ENOTFOUND" || err.code === "EAI_AGAIN"
            ? "dns"
            : "unknown";
      finish(new MasterSocketError(err.message, code));
    });

    socket.on("close", () => {
      if (settled) return;
      const merged = Buffer.concat(chunks);
      if (merged.length < MIN_RESPONSE_LENGTH) {
        finish(
          new MasterSocketError(
            `master closed connection with short response (${merged.length} bytes)`,
            "short-response",
          ),
        );
        return;
      }
      // If we reach here, length seemed sufficient but data handler did not finish:
      // treat as short response (length byte advertised more than we received).
      finish(
        new MasterSocketError(
          "master closed before complete response",
          "short-response",
        ),
      );
    });
  });
}
