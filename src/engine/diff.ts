import { createTwoFilesPatch } from 'diff';

export const createPatchDiff = (fileName: string, beforeText: string, afterText: string): string =>
  createTwoFilesPatch(fileName, fileName, beforeText, afterText, '', '', { context: 3 });
