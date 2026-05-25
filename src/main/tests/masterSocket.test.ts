import { EventEmitter } from "node:events";

import { describe, it, expect, vi } from "vitest";

import {
  fetchMasterWebRoot,
  MasterSocketError,
} from "../utils/version-sources/masterSocket";

// Fake socket replaces net.Socket. Tests drive its data/close/error events manually.
class FakeSocket extends EventEmitter {
  public destroyed = false;
  public written: Buffer[] = [];
  write(chunk: Buffer): boolean {
    this.written.push(chunk);
    return true;
  }
  destroy(): void {
    this.destroyed = true;
    this.emit("close");
  }
}

function buildResponse(webRoot: string): Buffer {
  // 1 byte unknown + 33 bytes blank + 1 byte url length + url(utf16le) + trailing backup bytes (ignored)
  const urlBytes = Buffer.from(webRoot, "utf16le");
  if (urlBytes.length % 2 !== 0)
    throw new Error("utf16le bytes must be even length");
  const urlLen = urlBytes.length / 2;
  const head = Buffer.concat([
    Buffer.from([0x02]),
    Buffer.alloc(33),
    Buffer.from([urlLen]),
  ]);
  // Add a trailing 1-byte blank + 1-byte length + same url as "backup" so structure resembles real response
  const tail = Buffer.concat([Buffer.from([0x00, urlLen]), urlBytes]);
  return Buffer.concat([head, urlBytes, tail]);
}

function driveConnect(socket: FakeSocket): void {
  // emit connect on next tick to mimic real socket
  setImmediate(() => socket.emit("connect"));
}

describe("fetchMasterWebRoot", () => {
  it("parses a normal response (single chunk)", async () => {
    const expected =
      "https://patch.poe2.kakaogames.com/production/patch/4.4.0.13/";
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE2", {
      connect: () => fake as unknown as never,
    });
    driveConnect(fake);
    await vi.waitFor(() => expect(fake.written.length).toBeGreaterThan(0));
    expect(Array.from(fake.written[0])).toEqual([0x01, 0x07]);
    fake.emit("data", buildResponse(expected));
    await expect(promise).resolves.toEqual({ webRoot: expected });
  });

  it("reassembles a response that arrives byte-by-byte", async () => {
    const expected = "https://poe.gdn.gamecdn.net/live/patch/3.28.0.10/";
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE1", {
      connect: () => fake as unknown as never,
    });
    driveConnect(fake);
    const buf = buildResponse(expected);
    for (const byte of buf) fake.emit("data", Buffer.from([byte]));
    await expect(promise).resolves.toEqual({ webRoot: expected });
  });

  it("rejects with short-response when connection closes early", async () => {
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE1", {
      connect: () => fake as unknown as never,
    });
    driveConnect(fake);
    fake.emit("data", Buffer.from([0x02, 0x00, 0x00, 0x00])); // too short
    fake.emit("close");
    await expect(promise).rejects.toMatchObject({
      name: "MasterSocketError",
      code: "short-response",
    });
  });

  it("rejects with empty-url when url length byte is 0", async () => {
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE1", {
      connect: () => fake as unknown as never,
    });
    driveConnect(fake);
    const buf = Buffer.concat([
      Buffer.from([0x02]),
      Buffer.alloc(33),
      Buffer.from([0x00]), // url_length = 0
      Buffer.alloc(4),
    ]);
    fake.emit("data", buf);
    await expect(promise).rejects.toMatchObject({
      name: "MasterSocketError",
      code: "empty-url",
    });
  });

  it("rejects with timeout if server never responds", async () => {
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE1", {
      timeoutMs: 30,
      connect: () => fake as unknown as never,
    });
    driveConnect(fake);
    await expect(promise).rejects.toBeInstanceOf(MasterSocketError);
    await expect(promise).rejects.toMatchObject({ code: "timeout" });
  });

  it("maps ECONNREFUSED to connection-refused", async () => {
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE1", {
      connect: () => fake as unknown as never,
    });
    setImmediate(() => {
      const err = new Error("connect ECONNREFUSED") as NodeJS.ErrnoException;
      err.code = "ECONNREFUSED";
      fake.emit("error", err);
    });
    await expect(promise).rejects.toMatchObject({
      name: "MasterSocketError",
      code: "connection-refused",
    });
  });

  it("maps ENOTFOUND to dns", async () => {
    const fake = new FakeSocket();
    const promise = fetchMasterWebRoot("POE1", {
      connect: () => fake as unknown as never,
    });
    setImmediate(() => {
      const err = new Error("getaddrinfo ENOTFOUND") as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      fake.emit("error", err);
    });
    await expect(promise).rejects.toMatchObject({
      name: "MasterSocketError",
      code: "dns",
    });
  });
});
