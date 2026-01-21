export interface LogEntry {
  timestamp: number;
  type: string;
  content: string;
  isError: boolean;
  count?: number;
  typeColor?: string;
  textColor?: string;
  // UI Meta
  contentHash?: string;
  mergeGroupId?: string;
  mergeGroupSize?: number;
}
