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
import {
  addInterfaceExtends,
  removeInterfaceExtends,
  replaceFunctionBody,
  updateParamType,
  updatePropertyType,
  updateReturnType,
} from './ops/structuralUpdates.js';
import { updateConstructor } from './ops/updateConstructor.js';
import { updateFunction } from './ops/updateFunction.js';
import { updateInterface } from './ops/updateInterface.js';
import {
  type PatchBatchOperation,
  type PatchProjectOperation,
  patchBatchOperationSchema,
  patchProjectOperationSchema,
} from './schema/batch.js';
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

export interface ApplyProjectOperationResult {
  index: number;
  file: string;
  success: boolean;
  changed: boolean;
}

export interface ApplyProjectResponse {
  success: boolean;
  patchedFiles: string[];
  rejects: ApplyReject[];
  diagnostics: string[];
  diffByFile: Record<string, string>;
  updatedTextByFile?: Record<string, string>;
  operationResults: ApplyProjectOperationResult[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

interface InternalOperationResult {
  changed: boolean;
  updatedText: string;
  diff: string;
}

interface ErrorDetails {
  rejects: ApplyReject[];
  diagnostics: string[];
}

const formatZodIssueMessage = (error: ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

const formatZodIssues = (error: ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });

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
    case 'update_return_type': {
      const result = updateReturnType(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'update_param_type': {
      const result = updateParamType(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'update_property_type': {
      const result = updatePropertyType(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'replace_function_body': {
      const result = replaceFunctionBody(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'add_interface_extends': {
      const result = addInterfaceExtends(sourceFile, operation);
      updatedText = result.updatedText;
      changed = result.changed;
      break;
    }
    case 'remove_interface_extends': {
      const result = removeInterfaceExtends(sourceFile, operation);
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

export const validatePatchOperation = (input: unknown): ValidationResult => {
  const parsed = patchOperationSchema.safeParse(input);
  if (parsed.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: formatZodIssues(parsed.error),
  };
};

export const validatePatchBatchOperation = (input: unknown): ValidationResult => {
  const parsed = patchBatchOperationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: formatZodIssues(parsed.error),
    };
  }

  try {
    validateBatchFiles(parsed.data);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  return { valid: true };
};

export const validatePatchProjectOperation = (input: unknown): ValidationResult => {
  const parsed = patchProjectOperationSchema.safeParse(input);
  if (parsed.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: formatZodIssues(parsed.error),
  };
};

export const parsePatchOperation = (input: unknown): PatchOperation => {
  try {
    return patchOperationSchema.parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) {
      throw error;
    }

    throw new AstmendError(
      'INVALID_INPUT',
      `Invalid patch operation: ${formatZodIssueMessage(error)}`,
    );
  }
};

export const parsePatchBatchOperation = (input: unknown): PatchBatchOperation => {
  try {
    return patchBatchOperationSchema.parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) {
      throw error;
    }

    throw new AstmendError(
      'INVALID_INPUT',
      `Invalid patch batch operation: ${formatZodIssueMessage(error)}`,
    );
  }
};

export const parsePatchProjectOperation = (input: unknown): PatchProjectOperation => {
  try {
    return patchProjectOperationSchema.parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) {
      throw error;
    }

    throw new AstmendError(
      'INVALID_INPUT',
      `Invalid patch project operation: ${formatZodIssueMessage(error)}`,
    );
  }
};

const createErrorDetails = (error: unknown, filePath?: string): ErrorDetails => {
  if (isAstmendError(error)) {
    return {
      rejects: [
        {
          path: filePath ?? 'unknown',
          reason: mapErrorCodeToReason(error.code),
        },
      ],
      diagnostics: [error.message],
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    rejects: [
      {
        path: filePath ?? 'unknown',
        reason: 'UNKNOWN',
      },
    ],
    diagnostics: [message],
  };
};

const createErrorResponse = (error: unknown, filePath?: string): ApplyResponse => {
  const details = createErrorDetails(error, filePath);
  return {
    success: false,
    patchedFiles: [],
    rejects: details.rejects,
    diagnostics: details.diagnostics,
    diff: '',
  };
};

const createProjectErrorResponse = (error: unknown, filePath?: string): ApplyProjectResponse => {
  const details = createErrorDetails(error, filePath);
  return {
    success: false,
    patchedFiles: [],
    rejects: details.rejects,
    diagnostics: details.diagnostics,
    diffByFile: {},
    updatedTextByFile: {},
    operationResults: [],
  };
};

const extractFilePath = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null || !('file' in input)) {
    return undefined;
  }

  const { file } = input as { file?: unknown };
  return typeof file === 'string' ? file : undefined;
};

const extractProjectFilePath = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null || !('operations' in input)) {
    return undefined;
  }

  const { operations } = input as { operations?: unknown };
  if (!Array.isArray(operations) || operations.length === 0) {
    return undefined;
  }

  const firstOperation = operations[0] as { file?: unknown };
  return typeof firstOperation?.file === 'string' ? firstOperation.file : undefined;
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

const validateBatchFiles = (batch: PatchBatchOperation) => {
  for (const [index, operation] of batch.operations.entries()) {
    if (operation.file !== batch.file) {
      throw new AstmendError(
        'INVALID_INPUT',
        `Batch operation ${index} targets ${operation.file}, expected ${batch.file}`,
      );
    }
  }
};

const applyPatchBatch = (batch: PatchBatchOperation, sourceText: string): ApplyResponse => {
  validateBatchFiles(batch);

  let currentText = sourceText;
  const rejects: ApplyReject[] = [];
  const diagnostics: string[] = [];

  for (const [index, operation] of batch.operations.entries()) {
    try {
      const result = executeOperation(operation, currentText);
      currentText = result.updatedText;
    } catch (error) {
      const rejectResponse = createErrorResponse(error, operation.file);
      rejects.push(...rejectResponse.rejects);
      diagnostics.push(
        ...rejectResponse.diagnostics.map((message) => `operation ${index}: ${message}`),
      );

      if (batch.stopOnReject ?? true) {
        break;
      }
    }
  }

  const changed = currentText !== sourceText;
  return {
    success: rejects.length === 0,
    patchedFiles: changed ? [batch.file] : [],
    rejects,
    diagnostics,
    diff: changed ? createPatchDiff(batch.file, sourceText, currentText) : '',
    updatedText: currentText,
  };
};

const applyPatchProjectBatch = async (
  batch: PatchProjectOperation,
  loadSourceText: (filePath: string) => Promise<string>,
): Promise<ApplyProjectResponse> => {
  const currentTextByFile = new Map<string, string>();
  const originalTextByFile = new Map<string, string>();
  const rejects: ApplyReject[] = [];
  const diagnostics: string[] = [];
  const operationResults: ApplyProjectOperationResult[] = [];

  for (const [index, operation] of batch.operations.entries()) {
    try {
      if (!currentTextByFile.has(operation.file)) {
        const initialText = await loadSourceText(operation.file);
        currentTextByFile.set(operation.file, initialText);
        originalTextByFile.set(operation.file, initialText);
      }

      const currentText = currentTextByFile.get(operation.file);
      if (typeof currentText !== 'string') {
        throw new AstmendError('FILE_NOT_FOUND', `File not loaded: ${operation.file}`);
      }

      const result = executeOperation(operation, currentText);
      currentTextByFile.set(operation.file, result.updatedText);
      operationResults.push({
        index,
        file: operation.file,
        success: true,
        changed: result.changed,
      });
    } catch (error) {
      const details = createErrorDetails(error, operation.file);
      rejects.push(...details.rejects);
      diagnostics.push(...details.diagnostics.map((message) => `operation ${index}: ${message}`));
      operationResults.push({
        index,
        file: operation.file,
        success: false,
        changed: false,
      });

      if (batch.stopOnReject ?? true) {
        break;
      }
    }
  }

  const patchedFiles: string[] = [];
  const diffByFile: Record<string, string> = {};
  const updatedTextByFile: Record<string, string> = {};

  for (const [file, currentText] of currentTextByFile.entries()) {
    const originalText = originalTextByFile.get(file);
    if (typeof originalText !== 'string') {
      continue;
    }

    updatedTextByFile[file] = currentText;

    if (currentText !== originalText) {
      patchedFiles.push(file);
      diffByFile[file] = createPatchDiff(file, originalText, currentText);
    }
  }

  return {
    success: rejects.length === 0,
    patchedFiles,
    rejects,
    diagnostics,
    diffByFile,
    updatedTextByFile,
    operationResults,
  };
};

export const applyPatchBatchToText = (input: unknown, sourceText: string): ApplyResponse => {
  try {
    const batch = parsePatchBatchOperation(input);
    return applyPatchBatch(batch, sourceText);
  } catch (error) {
    return createErrorResponse(error, extractFilePath(input));
  }
};

export const applyPatchBatchFromFile = async (input: unknown): Promise<ApplyResponse> => {
  let filePath: string | undefined;
  try {
    const batch = parsePatchBatchOperation(input);
    filePath = batch.file;
    const document = await loadSourceDocumentFromFile(batch.file);
    return applyPatchBatch(batch, document.sourceText);
  } catch (error) {
    return createErrorResponse(error, filePath ?? extractFilePath(input));
  }
};

export const applyPatchBatchToFiles = async (
  input: unknown,
  sourceTextByFile: Record<string, string>,
): Promise<ApplyProjectResponse> => {
  try {
    const batch = parsePatchProjectOperation(input);
    return await applyPatchProjectBatch(batch, async (filePath) => {
      if (!Object.hasOwn(sourceTextByFile, filePath)) {
        throw new AstmendError('FILE_NOT_FOUND', `File not found: ${filePath}`);
      }
      const sourceText = sourceTextByFile[filePath];
      if (typeof sourceText !== 'string') {
        throw new AstmendError('INVALID_INPUT', `sourceTextByFile[${filePath}] must be a string`);
      }
      return sourceText;
    });
  } catch (error) {
    return createProjectErrorResponse(error, extractProjectFilePath(input));
  }
};

export const applyPatchBatchFromProject = async (input: unknown): Promise<ApplyProjectResponse> => {
  try {
    const batch = parsePatchProjectOperation(input);
    return await applyPatchProjectBatch(batch, async (filePath) => {
      const document = await loadSourceDocumentFromFile(filePath);
      return document.sourceText;
    });
  } catch (error) {
    return createProjectErrorResponse(error, extractProjectFilePath(input));
  }
};
