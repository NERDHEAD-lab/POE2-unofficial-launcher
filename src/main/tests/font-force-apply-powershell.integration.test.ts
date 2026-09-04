import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  buildGetFontForceApplyScript,
  buildSetFontForceApplyScript,
} from "../utils/powershell";

// Every cmdlet is shadowed locally. These tests execute real PowerShell syntax but NEVER change OS policy.
function runWithFakeCmdlets(script: string, setup = "") {
  const source = `
    $ErrorActionPreference = 'Stop'
    $script:states = @{ 'PathOfExile_KG.exe' = 'ON'; 'PathOfExile.exe' = 'OFF' }
    $script:systemState = 'NOTSET'
    $script:calls = @()
    $script:failRead = ''; $script:failWrite = ''; $script:running = $false
    function Get-ProcessMitigation {
      [CmdletBinding()] param([string]$Name, [switch]$System)
      if ($Name -eq $script:failRead -and -not $System) { throw 'fake query failure' }
      $value = if ($System) { $script:systemState } else { $script:states[$Name] }
      if ($null -eq $value) { return }
      [pscustomobject]@{ FontDisable = [pscustomobject]@{ DisableNonSystemFonts = $value } }
    }
    function Get-Process {
      [CmdletBinding()] param()
      if ($script:running) { [pscustomobject]@{ ProcessName = 'PathOfExile' } }
    }
    function Set-ProcessMitigation {
      [CmdletBinding()] param([string]$Name, [string[]]$Enable, [string[]]$Disable, [switch]$Remove)
      if ($Name -eq $script:failWrite) { throw 'fake write failure' }
      $script:calls += @{ name = $Name; enable = $Enable; disable = $Disable; remove = [bool]$Remove }
    }
    ${setup}
    $id = 'TRANSPORT_SENTINEL'; $results = 'TRANSPORT_RESULTS'
    $output = ${script}
    @{ payload = ($output | ConvertFrom-Json); calls = $script:calls; id = $id; results = $results } | ConvertTo-Json -Compress -Depth 8
  `;
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(source, "utf16le").toString("base64"),
    ],
    { encoding: "utf8", windowsHide: true, timeout: 15000 },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.error?.message || "PowerShell test failed",
    );
  return JSON.parse(result.stdout.trim());
}

describe.skipIf(process.platform !== "win32")(
  "font policy scripts with fake Windows cmdlets",
  () => {
    it("reads ON/OFF and does not leak variables into the persistent transport scope", () => {
      const result = runWithFakeCmdlets(buildGetFontForceApplyScript());
      expect(result.payload).toEqual({
        state: { "PathOfExile_KG.exe": true, "PathOfExile.exe": false },
        errors: {},
      });
      expect(result.id).toBe("TRANSPORT_SENTINEL");
      expect(result.results).toBe("TRANSPORT_RESULTS");
    });
    it("treats missing app policies as inheritance and resolves a system ON", () => {
      const result = runWithFakeCmdlets(
        buildGetFontForceApplyScript(),
        "$script:states['PathOfExile_KG.exe'] = $null; $script:states['PathOfExile.exe'] = 'NOTSET'; $script:systemState = 'ON'",
      );
      expect(result.payload.state).toEqual({
        "PathOfExile_KG.exe": true,
        "PathOfExile.exe": true,
      });
    });
    it("preserves a failed target as unknown without losing the other read", () => {
      const result = runWithFakeCmdlets(
        buildGetFontForceApplyScript(),
        "$script:failRead = 'PathOfExile.exe'",
      );
      expect(result.payload.state).toEqual({
        "PathOfExile_KG.exe": true,
        "PathOfExile.exe": null,
      });
      expect(result.payload.errors["PathOfExile.exe"]).toBe(
        "fake query failure",
      );
    });
    it("does not convert unrecognized enum values into OFF", () => {
      const result = runWithFakeCmdlets(
        buildGetFontForceApplyScript(),
        "$script:states['PathOfExile.exe'] = 'UNRECOGNIZED'",
      );
      expect(result.payload.state["PathOfExile.exe"]).toBeNull();
      expect(result.payload.errors["PathOfExile.exe"]).toContain(
        "Unknown font policy",
      );
    });
    it.each([true, false])(
      "sets only the font mitigation on both fixed targets for %s",
      (enabled) => {
        const result = runWithFakeCmdlets(
          buildSetFontForceApplyScript(enabled),
        );
        expect(result.payload.errors).toEqual({});
        expect(result.calls).toHaveLength(2);
        for (const call of result.calls) {
          expect(call[enabled ? "enable" : "disable"]).toEqual([
            "DisableNonSystemFonts",
          ]);
          expect(call.remove).toBe(!enabled);
        }
        expect(result.id).toBe("TRANSPORT_SENTINEL");
        expect(result.results).toBe("TRANSPORT_RESULTS");
      },
    );
    it("returns partial write failure rather than dropping successful target work", () => {
      const result = runWithFakeCmdlets(
        buildSetFontForceApplyScript(true),
        "$script:failWrite = 'PathOfExile.exe'",
      );
      expect(result.calls).toHaveLength(1);
      expect(result.payload.errors).toEqual({
        "PathOfExile.exe": "fake write failure",
      });
    });
    it("refuses to mutate after the UAC-stage process recheck detects a game", () => {
      expect(() =>
        runWithFakeCmdlets(
          buildSetFontForceApplyScript(true),
          "$script:running = $true",
        ),
      ).toThrow();
    });
  },
);
