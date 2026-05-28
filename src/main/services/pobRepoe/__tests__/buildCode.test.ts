import fsp from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCodesRepresentSameXml,
  decodePobBuildCodeXml,
  encodePobBuildCodeXml,
  normalizePobBuildCodeInput,
  normalizePobBuildXmlForCompare,
} from "../buildCode";

const importedBuildPath = path.resolve(
  "src",
  "main",
  "services",
  "__fixtures__",
  "pob",
  "Imported Build2.xml",
);

describe("PoB build code utilities", () => {
  it("round-trips the Imported Build2 XML fixture through PoB build code format", async () => {
    const xml = await fsp.readFile(importedBuildPath, "utf8");
    const code = encodePobBuildCodeXml(xml);

    expect(code).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
    expect(normalizePobBuildXmlForCompare(decodePobBuildCodeXml(code))).toBe(
      normalizePobBuildXmlForCompare(xml),
    );
  });

  it("uses the same URL-safe base64 replacements as PoB Lua", () => {
    const xml = '<PathOfBuilding2><Build level="90" /></PathOfBuilding2>';
    const code = encodePobBuildCodeXml(xml);

    expect(code).not.toContain("+");
    expect(code).not.toContain("/");
    expect(decodePobBuildCodeXml(code)).toBe(xml);
  });

  it("accepts whitespace-wrapped direct build codes", () => {
    const code = encodePobBuildCodeXml("<PathOfBuilding2 />");

    expect(
      normalizePobBuildCodeInput(`\n ${code.slice(0, 8)} \n${code.slice(8)} `),
    ).toBe(code);
  });

  it("compares build codes by decoded XML content", () => {
    const xml = '<PathOfBuilding2><Build level="1" /></PathOfBuilding2>';
    const left = encodePobBuildCodeXml(`${xml}\n`);
    const right = encodePobBuildCodeXml(xml);

    expect(buildCodesRepresentSameXml(left, right)).toBe(true);
  });

  it("rejects external URLs until a downloader supplies the raw code", () => {
    expect(() => normalizePobBuildCodeInput("https://pobb.in/example")).toThrow(
      "direct base64 build code",
    );
  });
});
