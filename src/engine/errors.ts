export type AstmendErrorCode =
  | 'INVALID_INPUT'
  | 'FILE_NOT_FOUND'
  | 'SOURCE_PARSE_FAILED'
  | 'TYPE_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'DUPLICATE_CHANGE'
  | 'UNSUPPORTED_OPERATION';

export type ApplyReason =
  | 'SYMBOL_NOT_FOUND'
  | 'INVALID_PATCH_SCHEMA'
  | 'FILE_NOT_FOUND'
  | 'CONFLICT'
  | 'UNKNOWN';

export class AstmendError extends Error {
  public readonly code: AstmendErrorCode;

  public constructor(code: AstmendErrorCode, message: string) {
    super(message);
    this.name = 'AstmendError';
    this.code = code;
  }
}

export const isAstmendError = (error: unknown): error is AstmendError =>
  error instanceof AstmendError;

export const mapErrorCodeToReason = (code: AstmendErrorCode): ApplyReason => {
  switch (code) {
    case 'TYPE_NOT_FOUND':
    case 'TARGET_NOT_FOUND':
      return 'SYMBOL_NOT_FOUND';
    case 'INVALID_INPUT':
    case 'UNSUPPORTED_OPERATION':
      return 'INVALID_PATCH_SCHEMA';
    case 'FILE_NOT_FOUND':
      return 'FILE_NOT_FOUND';
    case 'TARGET_AMBIGUOUS':
    case 'DUPLICATE_CHANGE':
      return 'CONFLICT';
    default:
      return 'UNKNOWN';
  }
};
