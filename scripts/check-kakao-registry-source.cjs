#!/usr/bin/env node

const REQUEST_TIMEOUT_MS = 15_000;

const EXPECTED_SOURCES = [
  {
    gameId: "POE",
    documentKey: "poe",
    url: "https://common.gdn.gamecdn.net/live/config/kakaogames/poe.gamestarter.json",
    expected: {
      RegistryRoot: "HKCU",
      RegistryPath: [
        "SOFTWARE\\Kakaogames\\POE",
        "SOFTWARE\\DaumGames\\POE",
      ],
    },
  },
  {
    gameId: "POE2",
    documentKey: "poe2",
    url: "https://common.gdn.gamecdn.net/live/config/kakaogames/poe2.gamestarter.json",
    expected: {
      RegistryRoot: "HKCU",
      RegistryPath: [
        "SOFTWARE\\Kakaogames\\POE2",
        "SOFTWARE\\DaumGames\\POE2",
      ],
    },
  },
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractRegistryContract(document, documentKey) {
  const issues = [];

  if (!isRecord(document)) {
    return {
      contract: null,
      issues: ["root must be a JSON object"],
    };
  }

  if (!isRecord(document[documentKey])) {
    return {
      contract: null,
      issues: [`${documentKey} must be a JSON object`],
    };
  }

  const gameDocument = document[documentKey];
  if (!isRecord(gameDocument.live)) {
    return {
      contract: null,
      issues: [`${documentKey}.live must be a JSON object`],
    };
  }

  const fieldPrefix = `${documentKey}.live`;
  const registryRoot = gameDocument.live.RegistryRoot;
  const registryPath = gameDocument.live.RegistryPath;

  if (typeof registryRoot !== "string") {
    issues.push(`${fieldPrefix}.RegistryRoot must be a string`);
  }

  if (
    !Array.isArray(registryPath) ||
    registryPath.some((item) => typeof item !== "string")
  ) {
    issues.push(`${fieldPrefix}.RegistryPath must be an array of strings`);
  }

  return {
    contract:
      issues.length === 0
        ? {
            RegistryRoot: registryRoot,
            RegistryPath: [...registryPath],
          }
        : null,
    issues,
  };
}

function compareRegistryContract(actual, expected, documentKey) {
  const issues = [];
  const fieldPrefix = `${documentKey}.live`;

  if (actual.RegistryRoot !== expected.RegistryRoot) {
    issues.push(
      `${fieldPrefix}.RegistryRoot: expected ${JSON.stringify(expected.RegistryRoot)}, received ${JSON.stringify(actual.RegistryRoot)}`,
    );
  }

  if (actual.RegistryPath.length !== expected.RegistryPath.length) {
    issues.push(
      `${fieldPrefix}.RegistryPath length: expected ${expected.RegistryPath.length}, received ${actual.RegistryPath.length}`,
    );
  }

  const pathCount = Math.max(
    actual.RegistryPath.length,
    expected.RegistryPath.length,
  );
  for (let index = 0; index < pathCount; index += 1) {
    if (actual.RegistryPath[index] !== expected.RegistryPath[index]) {
      issues.push(
        `${fieldPrefix}.RegistryPath[${index}]: expected ${JSON.stringify(expected.RegistryPath[index])}, received ${JSON.stringify(actual.RegistryPath[index])}`,
      );
    }
  }

  return issues;
}

async function auditSource(source) {
  let response;
  try {
    response = await fetch(source.url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      gameId: source.gameId,
      kind: "NETWORK FAILURE",
      url: source.url,
      issues: [
        `network request failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  if (!response.ok) {
    return {
      gameId: source.gameId,
      kind: "NETWORK FAILURE",
      url: source.url,
      issues: [`network request failed: HTTP ${response.status}`],
    };
  }

  let document;
  try {
    document = await response.json();
  } catch (error) {
    return {
      gameId: source.gameId,
      kind: "INVALID RESPONSE",
      url: source.url,
      issues: [
        `response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const extracted = extractRegistryContract(document, source.documentKey);
  if (!extracted.contract) {
    return {
      gameId: source.gameId,
      kind: "SHAPE DRIFT",
      url: source.url,
      issues: extracted.issues.map((issue) => `source shape drift: ${issue}`),
    };
  }

  const issues = compareRegistryContract(
    extracted.contract,
    source.expected,
    source.documentKey,
  );
  return {
    gameId: source.gameId,
    kind: issues.length === 0 ? null : "VALUE DRIFT",
    url: source.url,
    issues,
  };
}

async function main() {
  process.stdout.write(
    "Auditing KakaoGames registry source contracts (opt-in network check).\n",
  );

  const results = await Promise.all(EXPECTED_SOURCES.map(auditSource));
  let failed = false;

  for (const result of results) {
    if (result.issues.length === 0) {
      process.stdout.write(`[OK] ${result.gameId}: ${result.url}\n`);
      continue;
    }

    failed = true;
    process.stderr.write(`[${result.kind}] ${result.gameId}: ${result.url}\n`);
    for (const issue of result.issues) {
      process.stderr.write(`  - ${issue}\n`);
    }
  }

  if (failed) {
    process.stderr.write(
      "KakaoGames registry source audit failed. Review publisher changes before updating the versioned runtime mapping.\n",
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write("KakaoGames registry source contracts match.\n");
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Unexpected KakaoGames registry source audit failure: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_SOURCES,
  compareRegistryContract,
  extractRegistryContract,
};
