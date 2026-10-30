export interface PlatformInfo {
  id: string;
  name: string;
  badgeClass: string;
}

export interface ParseResult {
  platform: PlatformInfo;
  timeline: import('./types').TimelineItem[];
  recordCount: number;
  totalTokens: number;
}

export interface PlatformParser {
  id: string;
  name: string;
  badgeClass: string;
  detect: (rawText: string, sampleRecords: any[]) => boolean;
  parse: (rawText: string) => ParseResult;
}
