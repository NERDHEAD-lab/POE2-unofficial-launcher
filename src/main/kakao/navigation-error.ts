type NavigationErrorLike = {
  code?: unknown;
  errno?: unknown;
};

export function isExpectedNavigationAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, errno } = error as NavigationErrorLike;
  return code === "ERR_ABORTED" || code === -3 || errno === -3;
}
