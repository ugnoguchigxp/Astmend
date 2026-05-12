import { isAstmendError } from '../engine/errors.js';

export type ToolResult = {
  isError?: true;
  structuredContent: Record<string, unknown>;
  content: {
    type: 'text';
    text: string;
  }[];
};

const normalizeStructuredContent = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { result: value };
};

export const toToolSuccessResult = (value: unknown): ToolResult => ({
  structuredContent: normalizeStructuredContent(value),
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

export const toToolErrorResult = (error: unknown): ToolResult => {
  if (isAstmendError(error)) {
    return {
      isError: true,
      structuredContent: {
        code: error.code,
        message: error.message,
      },
      content: [
        {
          type: 'text' as const,
          text: `AstmendError [${error.code}]: ${error.message}`,
        },
      ],
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      structuredContent: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error.message}`,
        },
      ],
    };
  }

  return {
    isError: true,
    structuredContent: {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error',
    },
    content: [
      {
        type: 'text' as const,
        text: 'Error: Unknown error',
      },
    ],
  };
};
