import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

type RegistryContract = {
  RegistryRoot: string;
  RegistryPath: string[];
};

type RegistrySource = {
  gameId: "POE" | "POE2";
  documentKey: "poe" | "poe2";
  url: string;
  expected: RegistryContract;
};

type ExtractResult = {
  contract: RegistryContract | null;
  issues: string[];
};

type RegistrySourceAuditModule = {
  EXPECTED_SOURCES: RegistrySource[];
  extractRegistryContract: (
    document: unknown,
    documentKey: string,
  ) => ExtractResult;
  compareRegistryContract: (
    actual: RegistryContract,
    expected: RegistryContract,
    documentKey: string,
  ) => string[];
};

const require = createRequire(import.meta.url);
const { EXPECTED_SOURCES, compareRegistryContract, extractRegistryContract } =
  require("../../../scripts/check-kakao-registry-source.cjs") as RegistrySourceAuditModule;

const poeFixture = {
  poe: {
    live: {
      RegistryRoot: "HKCU",
      RegistryPath: ["SOFTWARE\\Kakaogames\\POE", "SOFTWARE\\DaumGames\\POE"],
    },
  },
};

const poe2Fixture = {
  poe2: {
    live: {
      RegistryRoot: "HKCU",
      RegistryPath: ["SOFTWARE\\Kakaogames\\POE2", "SOFTWARE\\DaumGames\\POE2"],
    },
  },
};

const sourceFor = (gameId: RegistrySource["gameId"]) => {
  const source = EXPECTED_SOURCES.find(
    (candidate) => candidate.gameId === gameId,
  );
  if (!source) throw new Error(`Missing expected source for ${gameId}`);
  return source;
};

describe("KakaoGames registry source contract", () => {
  it.each([
    ["POE", poeFixture],
    ["POE2", poe2Fixture],
  ] as const)("extracts the nested %s contract", (gameId, fixture) => {
    const source = sourceFor(gameId);

    expect(extractRegistryContract(fixture, source.documentKey)).toEqual({
      contract: source.expected,
      issues: [],
    });
  });

  it("reports a missing top-level game key with its full field path", () => {
    expect(extractRegistryContract({}, "poe")).toEqual({
      contract: null,
      issues: ["poe must be a JSON object"],
    });
  });

  it("reports a missing live object with its full field path", () => {
    expect(extractRegistryContract({ poe2: {} }, "poe2")).toEqual({
      contract: null,
      issues: ["poe2.live must be a JSON object"],
    });
  });

  it("detects candidate order drift using full field paths", () => {
    const source = sourceFor("POE");
    const reversed = {
      RegistryRoot: "HKCU",
      RegistryPath: [...source.expected.RegistryPath].reverse(),
    };

    expect(
      compareRegistryContract(reversed, source.expected, source.documentKey),
    ).toEqual([
      'poe.live.RegistryPath[0]: expected "SOFTWARE\\\\Kakaogames\\\\POE", received "SOFTWARE\\\\DaumGames\\\\POE"',
      'poe.live.RegistryPath[1]: expected "SOFTWARE\\\\DaumGames\\\\POE", received "SOFTWARE\\\\Kakaogames\\\\POE"',
    ]);
  });
});
