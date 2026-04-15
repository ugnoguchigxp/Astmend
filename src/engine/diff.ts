import { parsePatch, createTwoFilesPatch } from 'diff';
import {
  type ClassDeclaration,
  type InterfaceDeclaration,
  type Node,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';
import { loadSourceDocumentFromText } from './project.js';

export type ChangedSymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'constructor'
  | 'interface'
  | 'property'
  | 'type_alias'
  | 'enum'
  | 'variable';

export type ChangedSymbolChangeKind = 'added' | 'modified' | 'removed';

export interface ChangedSymbol {
  kind: ChangedSymbolKind;
  name: string;
  changeKind: ChangedSymbolChangeKind;
  line: number;
  column: number;
  file: string;
  isExported: boolean;
  exportKind: 'named' | 'default' | null;
}

export interface ChangedSymbolReport {
  file: string;
  symbols: ChangedSymbol[];
}

export interface AnalyzeChangedSymbolsOptions {
  sourceText?: string;
  beforeText?: string;
  filePath?: string;
}

interface SymbolSpan {
  kind: ChangedSymbolKind;
  name: string;
  key: string;
  parentKey?: string;
  line: number;
  column: number;
  startLine: number;
  endLine: number;
  text: string;
  file: string;
  isExported: boolean;
  exportKind: 'named' | 'default' | null;
}

interface SymbolMatch extends SymbolSpan {
  changeKind: ChangedSymbolChangeKind;
}

const getLineSetsFromPatch = (
  patchText: string,
): Array<{ file: string; beforeChangedLines: Set<number>; afterChangedLines: Set<number> }> => {
  const patches = parsePatch(patchText);

  return patches.map((patch) => {
    const beforeChangedLines = new Set<number>();
    const afterChangedLines = new Set<number>();

    for (const hunk of patch.hunks) {
      let beforeLine = hunk.oldStart;
      let afterLine = hunk.newStart;

      for (const rawLine of hunk.lines) {
        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
          afterChangedLines.add(afterLine);
          afterLine += 1;
          continue;
        }

        if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
          beforeChangedLines.add(beforeLine);
          beforeLine += 1;
          continue;
        }

        if (rawLine.startsWith(' ')) {
          beforeLine += 1;
          afterLine += 1;
        }
      }
    }

    return {
      file: patch.newFileName !== 'unknown' ? patch.newFileName : patch.oldFileName,
      beforeChangedLines,
      afterChangedLines,
    };
  });
};

const getDeclarationExportInfo = (
  node: Node,
): { isExported: boolean; exportKind: 'named' | 'default' | null } => {
  const declaration = node as {
    isDefaultExport?: () => boolean;
    isExported?: () => boolean;
  };

  if (declaration.isDefaultExport?.()) {
    return { isExported: true, exportKind: 'default' };
  }

  if (declaration.isExported?.()) {
    return { isExported: true, exportKind: 'named' };
  }

  return { isExported: false, exportKind: null };
};

const getNodePosition = (node: Node) => {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    line: position.line,
    column: position.column,
  };
};

const createSpan = (
  node: Node,
  kind: ChangedSymbolKind,
  name: string,
  key: string,
  parentKey: string | undefined,
  exportInfo: { isExported: boolean; exportKind: 'named' | 'default' | null },
): SymbolSpan => {
  const position = getNodePosition(node);
  return {
    kind,
    name,
    key,
    parentKey,
    line: position.line,
    column: position.column,
    startLine: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    text: node.getText(),
    file: node.getSourceFile().getFilePath(),
    isExported: exportInfo.isExported,
    exportKind: exportInfo.exportKind,
  };
};

const collectClassMemberSpans = (classDeclaration: ClassDeclaration): SymbolSpan[] => {
  const className = classDeclaration.getName();
  if (!className) {
    return [];
  }

  const parentKey = `class:${className}`;
  const classExportInfo = getDeclarationExportInfo(classDeclaration);
  const members: SymbolSpan[] = [];

  for (const member of classDeclaration.getMethods()) {
    const name = member.getName();
    members.push(
      createSpan(member, 'method', name, `${parentKey}.method:${name}`, parentKey, classExportInfo),
    );
  }

  for (const constructorDeclaration of classDeclaration.getConstructors()) {
    members.push(
      createSpan(
        constructorDeclaration,
        'constructor',
        'constructor',
        `${parentKey}.constructor`,
        parentKey,
        classExportInfo,
      ),
    );
  }

  for (const property of classDeclaration.getProperties()) {
    const name = property.getName();
    members.push(
      createSpan(
        property,
        'property',
        name,
        `${parentKey}.property:${name}`,
        parentKey,
        classExportInfo,
      ),
    );
  }

  return members;
};

const collectInterfaceMemberSpans = (interfaceDeclaration: InterfaceDeclaration): SymbolSpan[] => {
  const interfaceName = interfaceDeclaration.getName();
  const parentKey = `interface:${interfaceName}`;
  const interfaceExportInfo = getDeclarationExportInfo(interfaceDeclaration);
  const members: SymbolSpan[] = [];

  for (const method of interfaceDeclaration.getMethods()) {
    const name = method.getName();
    members.push(
      createSpan(
        method,
        'method',
        name,
        `${parentKey}.method:${name}`,
        parentKey,
        interfaceExportInfo,
      ),
    );
  }

  for (const property of interfaceDeclaration.getProperties()) {
    const name = property.getName();
    members.push(
      createSpan(
        property,
        'property',
        name,
        `${parentKey}.property:${name}`,
        parentKey,
        interfaceExportInfo,
      ),
    );
  }

  return members;
};

const collectSymbolSpans = (sourceFile: SourceFile): SymbolSpan[] => {
  const spans: SymbolSpan[] = [];

  for (const declaration of sourceFile.getFunctions()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    spans.push(
      createSpan(declaration, 'function', name, `function:${name}`, undefined, getDeclarationExportInfo(declaration)),
    );
  }

  for (const declaration of sourceFile.getClasses()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    const classKey = `class:${name}`;
    spans.push(
      createSpan(declaration, 'class', name, classKey, undefined, getDeclarationExportInfo(declaration)),
    );
    spans.push(...collectClassMemberSpans(declaration));
  }

  for (const declaration of sourceFile.getInterfaces()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    const interfaceKey = `interface:${name}`;
    spans.push(
      createSpan(
        declaration,
        'interface',
        name,
        interfaceKey,
        undefined,
        getDeclarationExportInfo(declaration),
      ),
    );
    spans.push(...collectInterfaceMemberSpans(declaration));
  }

  for (const declaration of sourceFile.getTypeAliases()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    spans.push(
      createSpan(
        declaration,
        'type_alias',
        name,
        `type_alias:${name}`,
        undefined,
        getDeclarationExportInfo(declaration),
      ),
    );
  }

  for (const declaration of sourceFile.getEnums()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    spans.push(
      createSpan(
        declaration,
        'enum',
        name,
        `enum:${name}`,
        undefined,
        getDeclarationExportInfo(declaration),
      ),
    );
  }

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    spans.push(
      createSpan(
        declaration,
        'variable',
        name,
        `variable:${name}`,
        undefined,
        getDeclarationExportInfo(declaration),
      ),
    );
  }

  return spans;
};

const createSymbolMap = (sourceFile: SourceFile): Map<string, SymbolSpan> => {
  const spans = collectSymbolSpans(sourceFile);
  return new Map(spans.map((span) => [span.key, span]));
};

const isInsideSpan = (line: number, span: SymbolSpan): boolean =>
  line >= span.startLine && line <= span.endLine;

const getExclusiveChangedLines = (
  symbol: SymbolSpan,
  changedLines: Set<number>,
  descendants: SymbolSpan[],
): Set<number> => {
  const descendantLineSet = new Set<number>();

  for (const descendant of descendants) {
    for (const line of changedLines) {
      if (isInsideSpan(line, descendant)) {
        descendantLineSet.add(line);
      }
    }
  }

  const exclusiveLines = new Set<number>();
  for (const line of changedLines) {
    if (isInsideSpan(line, symbol) && !descendantLineSet.has(line)) {
      exclusiveLines.add(line);
    }
  }

  return exclusiveLines;
};

const hasChangedText = (beforeSymbol: SymbolSpan | undefined, afterSymbol: SymbolSpan | undefined) => {
  if (!beforeSymbol || !afterSymbol) {
    return true;
  }

  return beforeSymbol.text !== afterSymbol.text;
};

const toChangedSymbol = (symbol: SymbolSpan, changeKind: ChangedSymbolChangeKind): ChangedSymbol => ({
  kind: symbol.kind,
  name: symbol.name,
  changeKind,
  line: symbol.line,
  column: symbol.column,
  file: symbol.file,
  isExported: symbol.isExported,
  exportKind: symbol.exportKind,
});

const containsSpan = (outer: SymbolSpan, inner: SymbolSpan): boolean =>
  outer.key !== inner.key && outer.startLine <= inner.startLine && outer.endLine >= inner.endLine;

const pruneSymbols = (
  matches: SymbolMatch[],
  beforeSpans: Map<string, SymbolSpan>,
  afterSpans: Map<string, SymbolSpan>,
  beforeChangedLines: Set<number>,
  afterChangedLines: Set<number>,
): SymbolMatch[] => {
  const result: SymbolMatch[] = [];

  for (const match of matches) {
    const beforeSpan = beforeSpans.get(match.key);
    const afterSpan = afterSpans.get(match.key);
    const activeBeforeSpan = match.changeKind === 'added' ? undefined : beforeSpan;
    const activeAfterSpan = match.changeKind === 'removed' ? undefined : afterSpan;

    const activeSpan = activeAfterSpan ?? activeBeforeSpan;
    if (!activeSpan) {
      continue;
    }

    const beforeParentSpan = activeBeforeSpan;
    const afterParentSpan = activeAfterSpan;

    const beforeDescendantSpans = matches
      .filter((other) => other.key !== match.key)
      .map((other) => beforeSpans.get(other.key))
      .filter((value): value is SymbolSpan => Boolean(value))
      .filter((candidate) => (beforeParentSpan ? containsSpan(beforeParentSpan, candidate) : false));

    const afterDescendantSpans = matches
      .filter((other) => other.key !== match.key)
      .map((other) => afterSpans.get(other.key))
      .filter((value): value is SymbolSpan => Boolean(value))
      .filter((candidate) => (afterParentSpan ? containsSpan(afterParentSpan, candidate) : false));

    const exclusiveAfterChangedLines = afterParentSpan
      ? getExclusiveChangedLines(afterParentSpan, afterChangedLines, afterDescendantSpans)
      : new Set<number>();
    const exclusiveBeforeChangedLines = beforeParentSpan
      ? getExclusiveChangedLines(beforeParentSpan, beforeChangedLines, beforeDescendantSpans)
      : new Set<number>();

    if (
      match.changeKind === 'removed'
        ? exclusiveBeforeChangedLines.size > 0
        : match.changeKind === 'added'
          ? exclusiveAfterChangedLines.size > 0
          : exclusiveAfterChangedLines.size > 0 || exclusiveBeforeChangedLines.size > 0
    ) {
      result.push(match);
    }
  }

  return result;
};

const analyzePatchSymbols = (
  beforeText: string | undefined,
  afterText: string | undefined,
  filePath: string,
  beforeChangedLines: Set<number>,
  afterChangedLines: Set<number>,
): ChangedSymbol[] => {
  if (!beforeText && !afterText) {
    return [];
  }

  const beforeDocument = beforeText ? loadSourceDocumentFromText(filePath, beforeText) : undefined;
  const afterDocument = afterText ? loadSourceDocumentFromText(filePath, afterText) : undefined;

  const beforeSourceFile = beforeDocument?.project.getSourceFileOrThrow(beforeDocument.sourceFilePath);
  const afterSourceFile = afterDocument?.project.getSourceFileOrThrow(afterDocument.sourceFilePath);

  const beforeSpans = beforeSourceFile ? createSymbolMap(beforeSourceFile) : new Map<string, SymbolSpan>();
  const afterSpans = afterSourceFile ? createSymbolMap(afterSourceFile) : new Map<string, SymbolSpan>();

  const allKeys = new Set<string>([...beforeSpans.keys(), ...afterSpans.keys()]);
  const rawMatches: SymbolMatch[] = [];

  for (const key of allKeys) {
    const beforeSpan = beforeSpans.get(key);
    const afterSpan = afterSpans.get(key);

    if (!beforeSpan && afterSpan) {
      rawMatches.push({ ...afterSpan, changeKind: 'added' });
      continue;
    }

    if (beforeSpan && !afterSpan) {
      rawMatches.push({ ...beforeSpan, changeKind: 'removed' });
      continue;
    }

    if (beforeSpan && afterSpan && hasChangedText(beforeSpan, afterSpan)) {
      rawMatches.push({ ...afterSpan, changeKind: 'modified' });
    }
  }

  const prunedMatches = pruneSymbols(
    rawMatches,
    beforeSpans,
    afterSpans,
    beforeChangedLines,
    afterChangedLines,
  );

  return prunedMatches
    .map((match) => toChangedSymbol(match, match.changeKind))
    .sort((left, right) => left.line - right.line || left.column - right.column);
};

export const analyzeChangedSymbolsFromDiff = (
  patchText: string,
  options: AnalyzeChangedSymbolsOptions = {},
): ChangedSymbolReport[] => {
  const lineSets = getLineSetsFromPatch(patchText);
  const patches = parsePatch(patchText);

  return patches.map((patch, index) => {
    const lineSet = lineSets[index];
    if (!lineSet) {
      return {
        file: options.filePath ?? patch.newFileName,
        symbols: [],
      };
    }

    const file = options.filePath ?? lineSet.file;
    const symbols = analyzePatchSymbols(
      options.beforeText,
      options.sourceText,
      file,
      lineSet.beforeChangedLines,
      lineSet.afterChangedLines,
    );

    return {
      file,
      symbols,
    };
  });
};

export const analyzeChangedSymbolsFromText = (
  beforeText: string,
  afterText: string,
  fileName: string,
): ChangedSymbolReport[] =>
  analyzeChangedSymbolsFromDiff(createTwoFilesPatch(fileName, fileName, beforeText, afterText, '', '', { context: 3 }), {
    beforeText,
    sourceText: afterText,
    filePath: fileName,
  });

export const createPatchDiff = (fileName: string, beforeText: string, afterText: string): string =>
  createTwoFilesPatch(fileName, fileName, beforeText, afterText, '', '', { context: 3 });
