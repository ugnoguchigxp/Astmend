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
export {
  generateAstFingerprint,
  generateAstFingerprintFromFile,
  generateAstFingerprintFromText,
  getNormalizedAstStructure,
} from './engine/fingerprint.js';
export {
  analyzeImportExportGraphFromFile,
  analyzeImportExportGraphFromProject,
  type ExportInfo,
  type ImportEdge,
  type ImportExportGraph,
} from './engine/importExportGraph.js';
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
export {
  analyzeCodeUnitsFromFile,
  analyzeCodeUnitsFromProject,
  analyzeCodeUnitsFromText,
  type CodeUnitInfo,
  resolveSymbolCandidatesFromFile,
  resolveSymbolCandidatesFromProject,
  resolveSymbolCandidatesFromText,
  type SourceRange,
  type SymbolCandidate,
  scanCodeUnits,
  type TypeMetadata,
} from './engine/scanner.js';
export type { ToolResult } from './mcp/results.js';
export {
  type AstmendCapabilities,
  type AstmendMcpService,
  type AstmendMcpToolDefinition,
  createAstmendMcpService,
  getAstmendCapabilities,
} from './mcp/service.js';
export { addImport } from './ops/addImport.js';
export { removeImport } from './ops/removeImport.js';
export { renameSymbol } from './ops/renameSymbol.js';
export {
  addInterfaceExtends,
  removeInterfaceExtends,
  replaceFunctionBody,
  updateParamType,
  updatePropertyType,
  updateReturnType,
} from './ops/structuralUpdates.js';
export { updateConstructor } from './ops/updateConstructor.js';
export {
  type ApplyProjectOperationResult,
  type ApplyProjectResponse,
  type ApplyReject,
  type ApplyResponse,
  applyPatchBatchFromFile,
  applyPatchBatchFromProject,
  applyPatchBatchToFiles,
  applyPatchBatchToText,
  applyPatchFromFile,
  applyPatchToText,
  parsePatchBatchOperation,
  parsePatchOperation,
  parsePatchProjectOperation,
  type ValidationResult,
  validatePatchBatchOperation,
  validatePatchOperation,
  validatePatchProjectOperation,
} from './router.js';
export {
  type AnalyzeCodeUnitsOptions,
  analyzeCodeUnitsOptionsSchema,
  type CodeUnitKind,
  codeUnitKindSchema,
  type ReferenceTargetInput,
  referenceTargetSchema,
} from './schema/analysis.js';
export {
  type PatchBatchOperation,
  type PatchProjectExecutionMode,
  type PatchProjectOperation,
  patchBatchOperationSchema,
  patchProjectExecutionModeSchema,
  patchProjectOperationSchema,
} from './schema/batch.js';
export {
  type AddImportOperation,
  type AddInterfaceExtendsOperation,
  addImportSchema,
  addInterfaceExtendsSchema,
  type PatchOperation,
  patchOperationSchema,
  patchOperationTypes,
  type RemoveImportOperation,
  type RemoveInterfaceExtendsOperation,
  type RenameSymbolOperation,
  type ReplaceFunctionBodyOperation,
  removeImportSchema,
  removeInterfaceExtendsSchema,
  renameSymbolSchema,
  replaceFunctionBodySchema,
  type UpdateConstructorOperation,
  type UpdateFunctionOperation,
  type UpdateInterfaceOperation,
  type UpdateParamTypeOperation,
  type UpdatePropertyTypeOperation,
  type UpdateReturnTypeOperation,
  updateConstructorSchema,
  updateFunctionSchema,
  updateInterfaceSchema,
  updateParamTypeSchema,
  updatePropertyTypeSchema,
  updateReturnTypeSchema,
} from './schema/patch.js';
