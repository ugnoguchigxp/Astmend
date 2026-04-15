export {
  analyzeChangedSymbolsFromDiff,
  analyzeChangedSymbolsFromText,
  createPatchDiff,
  type AnalyzeChangedSymbolsOptions,
  type ChangedSymbol,
  type ChangedSymbolChangeKind,
  type ChangedSymbolKind,
  type ChangedSymbolReport,
} from './engine/diff.js';
export {
  type ApplyReason,
  AstmendError,
  isAstmendError,
  mapErrorCodeToReason,
} from './engine/errors.js';
export { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './engine/project.js';
export {
  analyzeReferences,
  analyzeReferencesFromFile,
  analyzeReferencesFromText,
  analyzeReferencesFromProject,
  batchAnalyzeReferences,
  batchAnalyzeReferencesFromFile,
  batchAnalyzeReferencesFromText,
  batchAnalyzeReferencesFromProject,
  detectImpactFromFile,
  detectImpactFromText,
  type ExportKind,
  type ImpactedDeclaration,
  type ReferenceAnalysis,
  type ReferenceLocation,
  type ReferenceTarget,
  type ReferenceTargetKind,
} from './engine/references.js';
export { addImport } from './ops/addImport.js';
export { removeImport } from './ops/removeImport.js';
export { renameSymbol } from './ops/renameSymbol.js';
export { updateConstructor } from './ops/updateConstructor.js';
export {
  type ApplyReject,
  type ApplyResponse,
  applyPatchFromFile,
  applyPatchToText,
  parsePatchOperation,
} from './router.js';
export {
  type AddImportOperation,
  addImportSchema,
  type PatchOperation,
  patchOperationSchema,
  type RemoveImportOperation,
  removeImportSchema,
  type RenameSymbolOperation,
  renameSymbolSchema,
  type UpdateConstructorOperation,
  type UpdateFunctionOperation,
  type UpdateInterfaceOperation,
  updateConstructorSchema,
  updateFunctionSchema,
  updateInterfaceSchema,
} from './schema/patch.js';
