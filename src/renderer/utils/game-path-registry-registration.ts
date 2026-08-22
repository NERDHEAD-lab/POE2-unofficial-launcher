import type { GameInstallPathDiagnostics } from "../../shared/types";

export type RegistryRegistrationEligibility =
  "eligible" | "unknown" | "blocked" | "not-applicable";

export const getRegistryRegistrationEligibility = (
  diagnostics: GameInstallPathDiagnostics,
): RegistryRegistrationEligibility => {
  if (
    diagnostics.serviceId !== "Kakao Games" ||
    !diagnostics.config.path ||
    diagnostics.config.verification !== "valid" ||
    diagnostics.registry.aggregateState === "valid"
  ) {
    return "not-applicable";
  }

  if (
    diagnostics.registry.candidates.some(
      (candidate) =>
        candidate.state === "read-failed" ||
        candidate.verification === "unknown",
    )
  ) {
    return "unknown";
  }

  const absentStates = new Set(["key-missing", "value-missing", "value-empty"]);
  if (
    diagnostics.registry.candidates.length === 2 &&
    diagnostics.registry.candidates.every(
      (candidate) =>
        candidate.path === null && absentStates.has(candidate.state),
    )
  ) {
    return "eligible";
  }

  return "blocked";
};
