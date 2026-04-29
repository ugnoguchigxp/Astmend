export {
  type AnalyzeChangedSymbolsOptions,
  analyzeChangedSymbolsFromDiff,
  analyzeChangedSymbolsFromText,
  type ChangedSymbol,
  type ChangedSymbolChangeKind,
  type ChangedSymbolKind,
  type ChangedSymbolReport,
  createPatchDiff,
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
  analyzeReferencesFromProject,
  analyzeReferencesFromText,
  batchAnalyzeReferences,
  batchAnalyzeReferencesFromFile,
  batchAnalyzeReferencesFromProject,
  batchAnalyzeReferencesFromText,
  detectImpactFromFile,
  detectImpactFromText,
  type ExportKind,
  type ImpactedDeclaration,
  type ReferenceAnalysis,
  type ReferenceLocation,
  type ReferenceTarget,
  type ReferenceTargetKind,
} from './engine/references.js';
export type { ToolResult } from './mcp/results.js';
export {
  type AstmendMcpService,
  type AstmendMcpToolDefinition,
  createAstmendMcpService,
} from './mcp/service.js';
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
  type RenameSymbolOperation,
  removeImportSchema,
  renameSymbolSchema,
  type UpdateConstructorOperation,
  type UpdateFunctionOperation,
  type UpdateInterfaceOperation,
  updateConstructorSchema,
  updateFunctionSchema,
  updateInterfaceSchema,
} from './schema/patch.js';
