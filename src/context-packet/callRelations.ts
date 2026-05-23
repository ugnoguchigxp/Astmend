import type { CallRelationInfo, ContextChangedSymbol } from './schema.js';

// Phase 1/2 keeps call relation extraction intentionally conservative.
export const extractCallRelations = (
  _changedSymbols: ContextChangedSymbol[],
): CallRelationInfo[] => [];
