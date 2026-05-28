import * as zlib from "node:zlib";

const POB_BUILD_CODE_CHARS = /^[A-Za-z0-9+/_=-]+$/;

export function normalizePobBuildCodeInput(input: string): string {
  const code = input.trim().replace(/\s+/g, "");
  if (!code) {
    throw new Error("PoB build code is empty");
  }
  if (!POB_BUILD_CODE_CHARS.test(code)) {
    throw new Error("PoB build code must be a direct base64 build code");
  }
  return code;
}

function toStandardBase64(base64Url: string): string {
  const standard = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = standard.length % 4;
  return padding === 0 ? standard : standard + "=".repeat(4 - padding);
}

function toPobBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_");
}

export function encodePobBuildCodeXml(xml: string): string {
  const compressed = zlib.deflateRawSync(Buffer.from(xml, "utf8"));
  return toPobBase64Url(compressed.toString("base64"));
}

export function decodePobBuildCodeXml(code: string): string {
  const normalized = normalizePobBuildCodeInput(code);
  const compressed = Buffer.from(toStandardBase64(normalized), "base64");
  return zlib.inflateRawSync(compressed).toString("utf8");
}

export function normalizePobBuildXmlForCompare(xml: string): string {
  return xml.replace(/\r\n?/g, "\n").trim();
}

export function buildCodesRepresentSameXml(
  left: string,
  right: string,
): boolean {
  return (
    normalizePobBuildXmlForCompare(decodePobBuildCodeXml(left)) ===
    normalizePobBuildXmlForCompare(decodePobBuildCodeXml(right))
  );
}
