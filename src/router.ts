import { ZodError } from 'zod';
import { createPatchDiff } from './engine/diff.js';
import {
  type ApplyReason,
  AstmendError,
  isAstmendError,
  mapErrorCodeToReason,
} from './engine/errors.js';
import { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './engine/project.js';
import { addImport } from './ops/addImport.js';
import { removeImport } from './ops/removeImport.js';
import { renameSymbol } from './ops/renameSymbol.js';
import { updateConstructor } from './ops/updateConstructor.js';
import { updateFunction } from './ops/updateFunction.js';
import { updateInterface } from './ops/updateInterface.js';
import { type PatchOperation, patchOperationSchema } from './schema/patch.js';

export interface ApplyReject {
  path: string;
  reason: ApplyReason;
  hunk?: string;
}

export interface ApplyResponse {
  success: boolean;
  patchedFiles: string[];
  rejects: ApplyReject[];
  diagnostics: string[];
  diff: string;
  // For internal/legacy use if needed, but primarily for the new IF
  updatedText?: string;
}

interface InternalOperationResult {
  changed: boolean;
  updatedText: string;
  diff: string;
}

const executeOperation = (
  operation: PatchOperation,
  sourceText: string,
): InternalOperationResult => {
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
    case 'rename_symbol': {
      const result = renameSymbol(sourceFile, operation);
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

const createErrorResponse = (error: unknown, filePath?: string): ApplyResponse => {
  if (isAstmendError(error)) {
    return {
      success: false,
      patchedFiles: [],
      rejects: [
        {
          path: filePath ?? 'unknown',
          reason: mapErrorCodeToReason(error.code),
        },
      ],
      diagnostics: [error.message],
      diff: '',
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    patchedFiles: [],
    rejects: [
      {
        path: filePath ?? 'unknown',
        reason: 'UNKNOWN',
      },
    ],
    diagnostics: [message],
    diff: '',
  };
};

const extractFilePath = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null || !('file' in input)) {
    return undefined;
  }

  const { file } = input as { file?: unknown };
  return typeof file === 'string' ? file : undefined;
};

export const applyPatchToText = (input: unknown, sourceText: string): ApplyResponse => {
  try {
    const operation = parsePatchOperation(input);
    const result = executeOperation(operation, sourceText);

    return {
      success: true,
      patchedFiles: result.changed ? [operation.file] : [],
      rejects: [],
      diagnostics: [],
      diff: result.diff,
      updatedText: result.updatedText,
    };
  } catch (error) {
    // If we failed before parsing the operation, we might not have the file path
    const filePath = extractFilePath(input);
    return createErrorResponse(error, filePath);
  }
};

export const applyPatchFromFile = async (input: unknown): Promise<ApplyResponse> => {
  let filePath: string | undefined;
  try {
    const operation = parsePatchOperation(input);
    filePath = operation.file;
    const document = await loadSourceDocumentFromFile(operation.file);
    const result = executeOperation(operation, document.sourceText);

    return {
      success: true,
      patchedFiles: result.changed ? [operation.file] : [],
      rejects: [],
      diagnostics: [],
      diff: result.diff,
      updatedText: result.updatedText,
    };
  } catch (error) {
    if (!filePath) {
      filePath = extractFilePath(input);
    }
    return createErrorResponse(error, filePath);
  }
};
