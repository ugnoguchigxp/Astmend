import { promises as fs } from 'node:fs';
import path from 'node:path';
import { IndentationText, Project, QuoteKind } from 'ts-morph';
import ts from 'typescript';
import { AstmendError } from './errors.js';

export interface SourceDocument {
  project: Project;
  sourceFilePath: string;
  sourceText: string;
}

const createProject = () =>
  new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      indentationText: IndentationText.TwoSpaces,
    },
  });

export const loadSourceDocumentFromText = (
  filePath: string,
  sourceText: string,
): SourceDocument => {
  const transpileResult = ts.transpileModule(sourceText, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });

  if ((transpileResult.diagnostics?.length ?? 0) > 0) {
    const message = transpileResult.diagnostics
      ?.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('; ');
    throw new AstmendError('SOURCE_PARSE_FAILED', `Failed to parse TypeScript source: ${message}`);
  }

  const project = createProject();
  const normalizedPath = path.posix.normalize(filePath.replaceAll(path.sep, path.posix.sep));
  project.createSourceFile(normalizedPath, sourceText, { overwrite: true });
  return {
    project,
    sourceFilePath: normalizedPath,
    sourceText,
  };
};

export const loadSourceDocumentFromFile = async (filePath: string): Promise<SourceDocument> => {
  try {
    const sourceText = await fs.readFile(filePath, 'utf8');
    return loadSourceDocumentFromText(filePath, sourceText);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      throw new AstmendError('FILE_NOT_FOUND', `File not found: ${filePath}`);
    }
    throw error;
  }
};

export const loadSourceDocumentFromProjectRoot = async (
  projectRoot: string,
  entryFile: string,
): Promise<SourceDocument> => {
  const normalizedProjectRoot = path.resolve(projectRoot);
  const tsconfigPath = path.join(normalizedProjectRoot, 'tsconfig.json');

  try {
    await fs.access(tsconfigPath);
  } catch {
    throw new AstmendError('FILE_NOT_FOUND', `File not found: ${tsconfigPath}`);
  }

  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      indentationText: IndentationText.TwoSpaces,
    },
  });

  const normalizedEntryFile = path.isAbsolute(entryFile)
    ? path.normalize(entryFile)
    : path.resolve(normalizedProjectRoot, entryFile);

  const sourceFile = project.getSourceFile(normalizedEntryFile) ?? project.addSourceFileAtPath(normalizedEntryFile);

  return {
    project,
    sourceFilePath: sourceFile.getFilePath(),
    sourceText: sourceFile.getFullText(),
  };
};
