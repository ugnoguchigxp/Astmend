import { isAstmendError } from '../index.js';

const normalizeStructuredContent = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { result: value };
};

export const toToolSuccessResult = (value: unknown) => ({
  structuredContent: normalizeStructuredContent(value),
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

export const toToolErrorResult = (error: unknown) => {
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
