import type { ContextChangedSymbol, SourceExcerptInfo } from './schema.js';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const getLineSlice = (
  sourceText: string,
  line: number,
  contextLines: number,
): Omit<SourceExcerptInfo, 'file'> => {
  const lines = sourceText.split('\n');
  if (lines.length === 0) {
    return {
      line,
      startLine: line,
      endLine: line,
      excerpt: '',
    };
  }

  const currentLine = clamp(line, 1, lines.length);
  const startLine = clamp(currentLine - contextLines, 1, lines.length);
  const endLine = clamp(currentLine + contextLines, 1, lines.length);
  const excerpt = lines.slice(startLine - 1, endLine).join('\n');

  return {
    line: currentLine,
    startLine,
    endLine,
    excerpt,
  };
};

export const buildSourceExcerpts = (
  symbols: ContextChangedSymbol[],
  sourceTextByFile: Map<string, string>,
  contextLines = 2,
): SourceExcerptInfo[] => {
  const excerpts: SourceExcerptInfo[] = [];
  const seen = new Set<string>();

  for (const symbol of symbols) {
    const sourceText =
      sourceTextByFile.get(symbol.file) ??
      [...sourceTextByFile.entries()].find(
        ([filePath]) => filePath.endsWith(symbol.file) || symbol.file.endsWith(filePath),
      )?.[1];
    if (!sourceText) {
      continue;
    }
    const key = `${symbol.file}:${symbol.line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const slice = getLineSlice(sourceText, symbol.line, contextLines);
    excerpts.push({
      file: symbol.file,
      ...slice,
    });
  }

  return excerpts;
};
