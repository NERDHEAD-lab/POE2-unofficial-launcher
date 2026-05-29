export interface BuildEditTargetIdentity {
  subPath: string;
  fileName: string | null;
  draftKey: number;
}

export const createBuildEditTargetKey = ({
  subPath,
  fileName,
  draftKey,
}: BuildEditTargetIdentity): string =>
  `${subPath}/${fileName ?? `draft:${draftKey}`}`;

export const createBuildEditSessionKey = (
  targetKey: string,
  sessionRevision: number,
): string => `${targetKey}:${sessionRevision}`;
