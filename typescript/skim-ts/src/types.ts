export interface OutlineItem {
  kind: string;
  name: string;
  startLine: number;
  endLine: number;
  startPos: number;
  endPos: number;
  rawHeader: string;
  parent?: OutlineItem;
  children: OutlineItem[];
  fieldsOrVariants: string[];
  isTest: boolean;
}

export function getQualifiedName(item: OutlineItem): string {
  if (item.parent) {
    return `${item.parent.name}.${item.name}`;
  }
  return item.name;
}

export interface SyntaxNotice {
  line: number;
  col: number;
  message: string;
}

export interface ParsedFile {
  filePath: string;
  sourceText: string;
  items: OutlineItem[];
  testRanges: [number, number][];
  imports: string[];
  totalLines: number;
  isTestFile: boolean;
  syntaxErrors: SyntaxNotice[];
}

export interface GlanceOptions {
  targets: string[];
  signatures?: boolean;
  details?: boolean;
  uses?: boolean;
  filter?: string[];
  includeTests?: boolean;
}

export interface BlockOptions {
  file: string;
  target: string;
  includeTests?: boolean;
  raw?: boolean;
}
