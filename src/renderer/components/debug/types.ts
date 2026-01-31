export interface LogEntry {
  timestamp: number;
  type: string;
  content: string;
  isError: boolean;
  count?: number;
  typeColor?: string;
  textColor?: string;
  priority?: number;
  // UI Meta
  contentHash?: string;
  mergeGroupId?: string;
  mergeGroupSize?: number;
}

export interface ExportableFile {
  name: string;
  content: string;
}

export interface ExportSource {
  id: string;
  label: string;
  getFiles: () => ExportableFile[];
}

export interface DebugTab {
  id: string;
  label: string;
  color?: string;
}

export interface DebugModule<T = Record<string, unknown>> {
  id: string; // Module Identifier
  order: number;
  position: "left" | "right";
  // 특정 시점의 Props를 기반으로 탭 목록 생성 (로그 타입 동적 반영 위함)
  getTabs: (props: T) => DebugTab[];
  // 활성화된 탭 ID와 Props를 받아 컨텐츠 렌더링
  renderPanel: (activeTabId: string, props: T) => React.ReactNode;
  // 해당 모듈이 제공하는 내보내기 목록
  getExportSources: (props: T) => ExportSource[];
}
