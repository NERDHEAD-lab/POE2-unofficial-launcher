const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

const readFlag = (name: string): boolean => {
  const value = process.env[name];
  return value ? TRUE_ENV_VALUES.has(value.trim().toLowerCase()) : false;
};

export const isAgentAutomationMode = (): boolean => readFlag("POE2_AGENT_MODE");

export const getAgentRemoteDebuggingPort = (): string | null => {
  const value = process.env["POE2_AGENT_DEBUG_PORT"]?.trim();
  if (!value || !/^\d{2,5}$/.test(value)) return null;
  return value;
};
