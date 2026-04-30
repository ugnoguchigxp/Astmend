# Astmend AST Core 改善計画

> 最終更新: 2026-04-30

この文書は、Astmend を **AST のメリットを最大化する TypeScript 解析・変換エンジン** として拡張するための実装計画である。

Gnosis / Converge など上位ツールのリトライ戦略、レビュー方針、公開 API 破壊判定、失敗分類ポリシーはこのリポジトリに入れない。Astmend は AST から得られる構造的事実と、AST 操作による安全な差分生成に責務を限定する。

---

## 0. 責務境界

### Astmend がやること

- TypeScript / TSX ソースを AST と TypeChecker で解析する
- 宣言、参照、import/export、型、範囲、構造 hash などの事実を返す
- AST 操作をメモリ上で適用し、`updatedText` と unified diff を返す
- ライブラリ API と MCP service で同じ構造化結果を返す
- 曖昧な対象指定や不正入力は、低レベルなエンジン事実として拒否する

### Astmend がやらないこと

- Gnosis / Converge 固有の failure reason を公開契約に入れる
- `EXPORT_CONTRACT_CHANGED` などのプロジェクトポリシー判定を行う
- 修正失敗後のリトライ戦略を決める
- 外部コマンドを実行して verify する
- ファイルへ直接保存する
- 常駐サービス、UI、ワークフロー管理を提供する

### 上位ツールに渡すべき材料

Astmend は判断そのものではなく、判断材料を返す。

例:

- `isExported: true`
- `exportKind: "named"`
- `signature: "(id: string) => User"`
- `changedSymbols: [...]`
- `references: [...]`
- `typeContext: {...}`
- `astHash: "..."`

上位ツールはこれらを使って「公開 API 破壊か」「再試行すべきか」「レビューで止めるか」を判断する。

---

## 1. 現状確認

この計画は、以下が既に実装済みである前提から開始する。

### 実装済みの解析 API

- `analyzeReferencesFromText`
- `analyzeReferencesFromFile`
- `analyzeReferencesFromProject`
- `batchAnalyzeReferences`
- `batchAnalyzeReferencesFromText`
- `batchAnalyzeReferencesFromFile`
- `batchAnalyzeReferencesFromProject`
- `detectImpactFromText`
- `detectImpactFromFile`
- `analyzeChangedSymbolsFromDiff`
- `analyzeChangedSymbolsFromText`

### 実装済みの AST 操作

- `update_function`
  - `add_param`
  - `remove_param`
- `update_interface`
  - `add_property`
  - `remove_property`
- `add_import`
- `remove_import`
- `update_constructor`
- `rename_symbol`

### 維持する既存契約

- 変更結果は `ApplyResponse` で返す
- ファイルへ直接書き込まない
- 変更が不要な場合は `success: true`, `patchedFiles: []`, `diff: ""` とする
- MCP service はライブラリ API と同じ構造化結果を返す
- `ApplyReason` は低レベル分類に留める

---

## 2. 実装順

優先順位は以下とする。

1. CodeUnit Scanner
2. Symbol Identity
3. Type Metadata
4. AST Fingerprint
5. Import / Export Graph
6. Patch Operation 拡張
7. Batch Apply

各項目は独立して PR 化できる粒度にする。1 つの項目を実装するときは、ライブラリ API、MCP service、テスト、README を同時に更新する。

---

## 3. Phase 1: CodeUnit Scanner

### 目的

プロジェクト内または単一ファイル内の主要なコード単位を AST ベースで列挙する。

参照解析は「特定 symbol の利用箇所」を調べる API だが、CodeUnit Scanner は「ファイルやプロジェクトに何が定義されているか」を一覧化する API とする。

### 公開 API

追加するライブラリ API:

```ts
analyzeCodeUnitsFromText(sourceText, options?)
analyzeCodeUnitsFromFile(filePath, options?)
analyzeCodeUnitsFromProject(projectRoot, options?)
```

追加する MCP tools:

```text
analyze_code_units_from_text
analyze_code_units_from_file
analyze_code_units_from_project
```

### スキーマ

新規ファイル:

- `src/schema/analysis.ts`
- `src/engine/scanner.ts`

入力:

```ts
type CodeUnitKind =
  | "function"
  | "class"
  | "method"
  | "constructor"
  | "interface"
  | "property"
  | "type_alias"
  | "enum"
  | "variable";

type AnalyzeCodeUnitsOptions = {
  kinds?: CodeUnitKind[];
  includeNonExported?: boolean;
  includeMembers?: boolean;
};
```

出力:

```ts
type CodeUnitInfo = {
  id: string;
  kind: CodeUnitKind;
  name: string;
  file: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  isExported: boolean;
  exportKind: "named" | "default" | null;
  parentId?: string;
};
```

### ID 仕様

`id` は同名 symbol を区別できる安定キーにする。

初期実装では以下の形式を採用する。

```text
<file>#<kind>:<name>@<startLine>:<startColumn>
```

例:

```text
src/user.ts#function:getUser@12:17
src/user.ts#class:UserService@30:14
src/user.ts#method:UserService.findById@34:3
```

メンバーの `name` は表示名、`id` は親名を含む qualified 表現にする。

### 実装タスク

- `src/schema/analysis.ts` に Zod schema と型を追加する
- `src/engine/scanner.ts` に `scanCodeUnits(sourceFile, options)` を追加する
- `function`, `class`, `method`, `constructor`, `interface`, `property`, `type_alias`, `enum`, `variable` を収集する
- `includeMembers` が false の場合、method / constructor / property は返さない
- `includeNonExported` が false の場合、top-level の非 export 宣言を除外する
- `src/index.ts` から公開する
- `src/mcp/service.ts` に 3 tool を追加する
- README に使い方を追加する

### テスト

追加または更新するテスト:

- `test/scanner.test.ts`
- `test/mcp-service.test.ts`
- `test/mcp-server.test.ts`

最低限のケース:

- named export function を検出できる
- default export class を検出できる
- 非 export 宣言を `includeNonExported` で制御できる
- class method / constructor / property を `includeMembers` で制御できる
- 同名関数が別ファイルにある場合も `id` が衝突しない
- MCP tool の `structuredContent` がライブラリ API と同等になる

### 完了条件

- `npm run typecheck` が通る
- `npm test` が通る
- `npm run build` が通る
- README に CodeUnit Scanner の API 例がある

---

## 4. Phase 2: Symbol Identity

### 目的

同名 symbol や曖昧な対象を、上位ツールが再指定できるようにする。

現在の `TARGET_AMBIGUOUS` は低レベルエラーとして妥当だが、呼び出し側が次に何を指定すればよいかの材料が不足する。Astmend は曖昧さを判断するだけでなく、候補 symbol の構造的情報を返せるようにする。

### 公開 API

追加するライブラリ API:

```ts
resolveSymbolCandidatesFromText(sourceText, target, options?)
resolveSymbolCandidatesFromFile(filePath, target, options?)
resolveSymbolCandidatesFromProject(projectRoot, target, options?)
```

追加する MCP tools:

```text
resolve_symbol_candidates_from_text
resolve_symbol_candidates_from_file
resolve_symbol_candidates_from_project
```

### 出力

```ts
type SymbolCandidate = CodeUnitInfo & {
  signature?: string;
};
```

`target` は既存の `ReferenceTarget` を拡張せず、まずは `kind` と `name` のままにする。候補出力に `id` と `range` を含め、次フェーズ以降で patch operation の target に `id` 指定を追加できるようにする。

### 実装タスク

- CodeUnit Scanner の収集ロジックを再利用する
- `kind + name` で候補を絞る
- 候補が 0 件でもエラーにせず `[]` を返す
- `signature` は Phase 3 の Type Metadata 実装後に拡張してよい

### テスト

- 同名関数 2 件の候補を返す
- class method の候補を返す
- project mode で別ファイルの同名 symbol を区別できる
- missing target は空配列になる

### 完了条件

- 上位ツールが `TARGET_AMBIGUOUS` 後に候補一覧を取得できる
- 候補の `id` が CodeUnit Scanner と同じ規則で安定する

---

## 5. Phase 3: Type Metadata

### 目的

TypeChecker から取得できる型情報を、判断ではなく事実として返す。

### 公開 API

既存 API に option で追加する。

```ts
type AnalyzeCodeUnitsOptions = {
  kinds?: CodeUnitKind[];
  includeNonExported?: boolean;
  includeMembers?: boolean;
  includeTypeMetadata?: boolean;
};
```

出力に追加:

```ts
type TypeMetadata = {
  signature?: string;
  returnType?: string;
  parameters?: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  properties?: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  literalUnionValues?: string[];
  typeParameters?: string[];
};
```

`CodeUnitInfo` に以下を追加する。

```ts
typeMetadata?: TypeMetadata;
```

### 実装タスク

- `includeTypeMetadata` が true のときだけ TypeChecker を使う
- function / method / constructor の parameters と return type を返す
- interface / type alias の properties を返す
- literal union は string / number literal union の値を返す
- 型解決できない場合は API 全体を失敗させず、その unit の `diagnostics` に載せる設計を検討する

### テスト

- function parameter / return type を返す
- interface property type を返す
- string literal union を返す
- `includeTypeMetadata: false` では type metadata を計算しない

### 完了条件

- 型情報が必要な場合だけ明示的に取得される
- 既存の参照解析と patch API の挙動が変わらない

---

## 6. Phase 4: AST Fingerprint

### 目的

識別子名や literal 値に依存しない、構造比較用の hash を返す。

用途は重複検出、類似コード検出、変更前後比較だが、類似度判定や採用判断は上位ツールに任せる。

### 公開 API

追加するライブラリ API:

```ts
generateAstFingerprintFromText(sourceText, target?)
generateAstFingerprintFromFile(filePath, target?)
```

CodeUnit Scanner の option に追加:

```ts
includeAstHash?: boolean;
```

`CodeUnitInfo` に追加:

```ts
astHash?: string;
```

### 正規化ルール

初期実装では以下を正規化する。

- Identifier: `ID`
- StringLiteral: `STR`
- NumericLiteral: `NUM`
- BigIntLiteral: `BIGINT`
- NoSubstitutionTemplateLiteral: `STR`
- TrueKeyword / FalseKeyword: `BOOL`

保持するもの:

- SyntaxKind
- 子ノード構造
- operator の種類
- call / property access / conditional / loop などの構文形

### 実装タスク

- `src/engine/fingerprint.ts` を追加する
- `Node.forEachChild` で構造文字列を生成する
- `sha256` hash を返す
- CodeUnit Scanner から対象 unit の node hash を返せるようにする

### テスト

- 変数名だけ違う同一構造の関数は同じ hash になる
- literal 値だけ違う同一構造の関数は同じ hash になる
- 分岐構造が違う関数は別 hash になる
- CodeUnit Scanner の `includeAstHash` で unit ごとの hash が返る

### 完了条件

- hash の正規化ルールが README か docs に明記されている
- hash が platform path に依存しない

---

## 7. Phase 5: Import / Export Graph

### 目的

ファイル間の import / export / re-export 関係を AST から抽出する。

Astmend は「export 契約が壊れた」とは判断しない。代わりに、どの symbol が export され、どこから import されているかを構造化して返す。

### 公開 API

追加するライブラリ API:

```ts
analyzeImportExportGraphFromFile(filePath)
analyzeImportExportGraphFromProject(projectRoot, options?)
```

追加する MCP tools:

```text
analyze_import_export_graph_from_file
analyze_import_export_graph_from_project
```

### 出力

```ts
type ImportExportGraph = {
  files: Array<{
    file: string;
    imports: ImportEdge[];
    exports: ExportInfo[];
  }>;
};

type ImportEdge = {
  fromFile: string;
  moduleSpecifier: string;
  importedName: string | null;
  localName: string;
  importKind: "named" | "default" | "namespace" | "side_effect";
  resolvedFile?: string;
};

type ExportInfo = {
  file: string;
  exportedName: string;
  localName?: string;
  exportKind: "named" | "default" | "namespace" | "re_export" | "export_all";
  moduleSpecifier?: string;
  resolvedFile?: string;
};
```

### 実装タスク

- `ImportDeclaration` を走査する
- `ExportDeclaration` と `ExportAssignment` を走査する
- tsconfig がある project mode では module specifier の解決を試みる
- 解決できない module は `resolvedFile` なしで返す
- side-effect import を表現する

### テスト

- named import / default import / namespace import を検出する
- side-effect import を検出する
- named export / default export を検出する
- re-export と export all を検出する
- project mode で相対 import の `resolvedFile` を返す

### 完了条件

- export されている symbol と import されている symbol の事実が取得できる
- ポリシー判断を含む field がない

---

## 8. Phase 6: Patch Operation 拡張

### 目的

AST 操作として閉じた、安全に diff 化できる変換を増やす。

### 追加候補

優先順:

1. `update_return_type`
2. `update_property_type`
3. `update_param_type`
4. `replace_function_body`
5. `add_interface_extends`
6. `remove_interface_extends`

### 設計ルール

- operation は 1 つの意味に絞る
- 変更対象は AST node として一意に解決できること
- 既に同じ形なら no-op success にする
- 異なる既存形がある場合は `CONFLICT` に map される低レベル error にする
- 型文字列を受け取る operation は `assertTypeResolvesInContext` を使う
- ファイル保存はしない

### スキーマ例

```ts
type UpdateReturnTypeOperation = {
  type: "update_return_type";
  file: string;
  target: {
    kind: "function" | "method";
    name: string;
    id?: string;
  };
  returnType: string;
};
```

`id` は Phase 2 の Symbol Identity 完了後に optional で受け付ける。`id` がある場合は `kind + name` より優先する。

### テスト

各 operation で以下を必ず用意する。

- success diff
- no-op idempotency
- target missing
- ambiguous target
- conflict
- invalid type
- MCP / library consistency

### 完了条件

- `patchOperationSchema` に追加される
- `router.ts` の switch に追加される
- `src/index.ts` から schema / type が export される
- README に JSON 例が追加される

---

## 9. Phase 7: Batch Apply

### 目的

複数の AST operation をメモリ上で順に適用し、最終 `updatedText` と統合 diff を返す。

外部コマンド実行、verify workflow、rollback orchestration は実装しない。Astmend は AST operation の逐次適用と結果生成に限定する。

### 公開 API

追加するライブラリ API:

```ts
applyPatchBatchToText(input, sourceText)
applyPatchBatchFromFile(input)
```

追加する MCP tools:

```text
apply_patch_batch_to_text
apply_patch_batch_from_file
```

### 入力

```ts
type PatchBatchOperation = {
  file: string;
  operations: PatchOperation[];
  stopOnReject?: boolean;
};
```

初期実装では単一ファイル内 batch に限定する。複数ファイル batch は別 Phase とする。

### 出力

既存の `ApplyResponse` を再利用する。

- すべて適用できた場合: `success: true`
- reject が 1 件以上ある場合: `success: false`
- `patchedFiles` は変更があったファイルのみ
- `diagnostics` は operation index を含める
- `rejects[].hunk` は可能なら該当 operation の diff 断片を入れる

### 実装タスク

- `src/schema/batch.ts` を追加する
- `router.ts` に batch 用関数を追加する
- 各 operation は直前の `updatedText` に対して適用する
- 統合 diff は original text と final text から生成する
- `stopOnReject` の default は true にする

### テスト

- add import + update function を 1 batch で適用できる
- 2 回目実行が no-op になる
- 途中 reject で停止する
- `stopOnReject: false` で後続 operation を継続する
- MCP / library consistency

### 完了条件

- 単一ファイル batch が安定して動く
- 既存 single operation API の挙動が変わらない

---

## 10. 実装時チェックリスト

各 Phase で必ず確認する。

- [ ] 既存 API を壊していない
- [ ] 新規 API は `src/index.ts` から export されている
- [ ] MCP service に tool が追加されている
- [ ] MCP server test が tool 登録を検証している
- [ ] library API と MCP result の構造が一致している
- [ ] no-op idempotency をテストしている
- [ ] ambiguous / missing / invalid input をテストしている
- [ ] README に最小利用例がある
- [ ] `npm run typecheck` が通る
- [ ] `npm test` が通る
- [ ] `npm run build` が通る

---

## 11. 実装しない項目

以下は Astmend ではなく上位ツール側で扱う。

- retry strategy
- failure taxonomy for agents
- `UNSAFE_CROSS_FILE_RENAME`
- `EXPORT_CONTRACT_CHANGED`
- review blocking policy
- external command verification
- workflow state management
- project-specific architectural rules

必要な場合、Astmend は判断材料となる AST facts を追加する。判断名や運用ポリシーは公開契約に入れない。
