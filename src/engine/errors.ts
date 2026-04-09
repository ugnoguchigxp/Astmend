export type AstmendErrorCode =
  | 'INVALID_INPUT'
  | 'FILE_NOT_FOUND'
  | 'SOURCE_PARSE_FAILED'
  | 'TYPE_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'DUPLICATE_CHANGE'
  | 'UNSUPPORTED_OPERATION';

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
