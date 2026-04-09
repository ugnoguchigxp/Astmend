import { patchOperationSchema, type PatchOperation } from './schema/patch.js';
import { AstmendError } from './engine/errors.js';
import { createPatchDiff } from './engine/diff.js';
import { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './engine/project.js';
import { addImport } from './ops/addImport.js';
import { removeImport } from './ops/removeImport.js';
import { updateFunction } from './ops/updateFunction.js';
import { updateInterface } from './ops/updateInterface.js';
import { updateConstructor } from './ops/updateConstructor.js';
import { ZodError } from 'zod';

export interface PatchResult {
  file: string;
  changed: boolean;
  updatedText: string;
  diff: string;
}

const executeOperation = (
  operation: PatchOperation,
  sourceText: string,
): Omit<PatchResult, 'file'> => {
  const document = loadSourceDocumentFromText(operation.file, sourceText);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  const beforeText = document.sourceText;

  let updatedText: string;
  let changed: boolean;

  switch (operation.type) {
    case 'update_function': {
      const result = updateFunction(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'update_interface': {
      const result = updateInterface(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'add_import': {
      const result = addImport(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'remove_import': {
      const result = removeImport(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'update_constructor': {
      const result = updateConstructor(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    default:
      throw new AstmendError(
        'UNSUPPORTED_OPERATION',
        `Unsupported operation: ${(operation as { type: string }).type}`,
      );
  }

  return {
    changed,
    updatedText,
    diff: changed ? createPatchDiff(operation.file, beforeText, updatedText) : '',
  };
};

export const parsePatchOperation = (input: unknown): PatchOperation => {
  try {
    return patchOperationSchema.parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) {
      throw error;
    }

    const message = error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
      })
      .join('; ');

    throw new AstmendError('INVALID_INPUT', `Invalid patch operation: ${message}`);
  }
};

export const applyPatchToText = (input: unknown, sourceText: string): PatchResult => {
  const operation = parsePatchOperation(input);
  const result = executeOperation(operation, sourceText);

  return {
    file: operation.file,
    ...result,
  };
};

export const applyPatchFromFile = async (input: unknown): Promise<PatchResult> => {
  const operation = parsePatchOperation(input);
  const document = await loadSourceDocumentFromFile(operation.file);
  const result = executeOperation(operation, document.sourceText);

  return {
    file: operation.file,
    ...result,
  };
};
