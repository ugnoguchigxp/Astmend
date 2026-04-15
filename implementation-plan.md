# Astmend 実装詳細計画

> 最終更新: 2026-04-15

この文書は、Astmend を **再利用可能な TypeScript AST エンジン** として育てるための実装計画である。
Astmend は特定の利用者に依存しない汎用ライブラリであり、拡張を進めつつも API 契約の汎用性を保つ。

---

## 0. 基本方針

### 目的

- TypeScript コードに対して AST ベースで安全な解析・修正を行う
- テキスト正規表現依存を減らし、解析精度を上げる
- 変更結果を diff で検証できるようにする
- MCP 経由でもライブラリ直呼びでも使える契約を維持する

### 維持する制約

| 制約 | 詳細 |
|------|------|
| ファイル非保存 | 変更結果は diff / updatedText で返す。書き込みは呼び出し側の責務 |
| 冪等性 | 同一命令の再実行で不要な変更を出さない |
| 明示性優先 | 曖昧な指定は拒否し、`AstmendError` で診断情報を返す |

### 設計上の前提

- 単一ファイル前提を超え、プロジェクト横断解析を扱えるようにする
- 解析ロジック (`engine/`) と MCP 露出層 (`mcp/`) を分離する
- 既存 API は壊さず、拡張は追加で行う（後方互換）

---

## 1. 現在の実装状況

本計画の REQ に着手する前に、既に実装済みの機能を整理する。

### パッチ操作（実装済み）

| 操作 | スキーマ | テスト |
|------|----------|--------|
| `update_function` (add_param) | `schema/patch.ts` | `router.test.ts` |
| `update_interface` (add_property) | `schema/patch.ts` | `router.test.ts` |
| `add_import` | `schema/patch.ts` | `phase3.test.ts` |
| `remove_import` (named 必須) | `schema/patch.ts` | `phase3.test.ts` |
| `update_constructor` (add_param) | `schema/patch.ts` | `phase3.test.ts` |

### 解析（実装済み）

| 機能 | エントリポイント | テスト |
|------|------------------|--------|
| 参照解析（単一ファイル） | `analyzeReferencesFromText` / `analyzeReferencesFromFile` | `phase4.test.ts` |
| 影響範囲検出（単一ファイル） | `detectImpactFromText` / `detectImpactFromFile` | `phase4.test.ts` |

### MCP ツール（実装済み）

`apply_patch_to_text`, `apply_patch_from_file`, `analyze_references_from_text`, `analyze_references_from_file`, `detect_impact_from_text`, `detect_impact_from_file`

### 未実装（本計画の対象）

- export / visibility 情報の付与
- diff からの変更シンボル抽出
- プロジェクト横断の参照解析
- 削除系パッチ操作 (`remove_param`, `remove_property`)
- `remove_import` のモジュール全体削除
- バッチ解析 API
- `rename_symbol`

> **注**: 既存テストファイル名 (`phase3.test.ts`, `phase4.test.ts`) は初期開発時のフェーズ番号に由来する。本計画の Phase 番号とは対応しない。

---

## 2. 要件一覧と採用方針

### 今回採用する要件

| ID | 概要 | Phase | 依存 |
|----|------|-------|------|
| REQ-A03 | export / visibility 情報の付与 | 1 | なし |
| REQ-A02 | diff からの変更シンボル抽出 | 1 | REQ-A03（`isExported` を利用） |
| REQ-A01 | プロジェクト横断の参照解析 | 1 | REQ-A03（export 判定を流用） |
| REQ-A05 | `remove_param` / `remove_property` | 2 | なし |
| REQ-A06 | `remove_import` のモジュール全体削除 | 2 | なし |
| REQ-A04 | バッチ解析 API | 3 | REQ-A01（複数ファイル解析の基盤を利用） |

### 将来対応

| ID | 概要 | 前提条件 |
|----|------|----------|
| REQ-A07 | `rename_symbol` | REQ-A01（プロジェクト横断参照が前提） |

### 実装順の原則

1. **解析の信頼性を先に上げる** — export 判定 → diff 解析 → 横断参照
2. **削除系操作で修正面を広げる** — remove_param → remove_import 全体削除
3. **効率化 API で運用負荷を下げる** — バッチ解析

---

## 3. フェーズ構成

```
Phase 1: 解析基盤          Phase 2: 修正操作の拡張     Phase 3: 効率化
┌─────────────────────┐   ┌──────────────────────┐   ┌─────────────┐
│ REQ-A03 (export)    │   │ REQ-A05 (remove_*)   │   │ REQ-A04     │
│        ↓            │   │ REQ-A06 (remove_imp) │   │ (batch API) │
│ REQ-A02 (diff解析)  │   └──────────────────────┘   └─────────────┘
│        ↓            │
│ REQ-A01 (横断参照)  │        Phase 4: 将来拡張
└─────────────────────┘   ┌──────────────────────┐
                          │ REQ-A07 (rename)     │
                          └──────────────────────┘
```

Phase 2 は Phase 1 と並行着手できる。Phase 3 は Phase 1 完了後に着手する。

---

## 4. Phase 1: 解析基盤

### 4.1 REQ-A03: export / visibility 情報の付与

#### 目的

公開 API の変更を判定しやすくする。

#### 変更対象ファイル

- `src/engine/references.ts` — `ReferenceAnalysis` 型の拡張
- `test/phase4.test.ts` — export 判定テストの追加

#### 実装タスク

- `ReferenceAnalysis` に `isExported: boolean` を追加する
- `exportKind` を追加する
  - `'named'` — `export function foo()`
  - `'default'` — `export default function`
  - `'namespace'` — `export * as ns from`、もしくは `export =`
  - `null` — export されていない場合
- 対象シンボルの宣言ノードから export 状態を判定する
- `analyzeReferences` / `analyzeReferencesFromText` / `analyzeReferencesFromFile` の返却値を拡張する

#### 完了条件

- [ ] `ReferenceAnalysis` に `isExported` と `exportKind` が含まれる
- [ ] `export function`, `export default class`, 非 export 関数の 3 パターンでテストが通る
- [ ] 既存の参照解析テスト (`phase4.test.ts`) が変更なしで通る

---

### 4.2 REQ-A02: diff からの変更シンボル抽出

#### 目的

unified diff から変更対象シンボルを AST ベースで正確に抽出する。

#### 変更対象ファイル

- `src/engine/diff.ts` — 解析関数の追加（既存の `createPatchDiff` とは独立）
- テストファイルの新規追加

#### 実装タスク

- unified diff を受け取り、変更行を特定する解析関数を追加する
- `sourceText` を併用して変更行を AST ノードに紐付ける
- 以下の宣言形式を正確に扱う
  - `export default function` / アロー関数
  - class / method
  - 行をまたぐ宣言
  - ネストされた interface / type alias
- 戻り値に `added` / `modified` / `removed` の区分を含める
- REQ-A03 の `isExported` / `exportKind` を同時に返す

#### 完了条件

- [ ] regex を使わず、AST ベースでシンボルを抽出できる
- [ ] 複数行にまたがる宣言の変更を正しく検出する
- [ ] `added` / `modified` / `removed` を区別して返す
- [ ] `isExported` が各シンボルに付与される

#### 依存

REQ-A03 の `isExported` 判定ロジックを利用する。

---

### 4.3 REQ-A01: プロジェクト横断の参照解析

#### 目的

他ファイルからの参照を含めて対象シンボルの利用箇所を追跡する。

#### 実装方針

- 本命は `projectRoot` 指定によるディスクベース解析とする
- 補助的に `filePaths` 指定の軽量モード（対象ファイルを明示的に列挙）を許容する
- `ts-morph Project` をディスクファイルシステム前提で構築する
  - 現在の `loadSourceDocumentFromText` は in-memory `Project` を使用しており、横断解析には不向き
  - ディスクベースの `Project` を別途構築し、tsconfig を解決する
- import チェーンをたどって参照を集める

#### 変更対象ファイル

- `src/engine/project.ts` — ディスクベース `Project` 構築関数の追加
- `src/engine/references.ts` — クロスファイル参照解析関数の追加、`ReferenceLocation` の拡張
- `src/mcp/server.ts` — 新規 MCP ツールの登録
- テストファイルの新規追加

#### 実装タスク

- `ReferenceLocation` に `file: string` と `isDefinition: boolean` を追加する
  - 既存の単一ファイル解析では `file` は省略可能（後方互換）
- 新しい入力型を追加する
  - `projectRoot: string` — tsconfig.json のあるディレクトリ
  - `entryFile: string` — 解析起点のファイルパス
  - `target: ReferenceTarget`
  - `maxDepth?: number` — import チェーンの最大深度
- ディスクベースの `Project` を構築する初期化処理を追加する
- 参照解析対象の SourceFile をプロジェクトから解決する
- 参照を `file` 付きで返す
- 定義箇所と参照箇所を `isDefinition` で区別する

#### 完了条件

- [ ] 他ファイルからの import 経由の参照を返せる
- [ ] 定義箇所と参照箇所が `isDefinition` で分離される
- [ ] 3 ファイル以上にまたがるテストケースが通る
- [ ] 既存の単一ファイル参照解析テスト (`phase4.test.ts`) が変更なしで通る

#### 依存

REQ-A03 の export 判定ロジックを利用して、export されたシンボルのみ横断参照を追跡する。

---

## 5. Phase 2: 修正操作の拡張

> Phase 1 と並行して着手可能。既存のパッチ操作スキーマとルーティングの拡張のみで完結する。

### 5.1 REQ-A05: `remove_param` / `remove_property`

#### 目的

削除系の修正操作をサポートし、追加系だけでなく不要な引数やプロパティの除去も扱えるようにする。

#### 変更対象ファイル

- `src/schema/patch.ts` — `changes` への `remove_param` / `remove_property` 追加
- `src/ops/updateFunction.ts` — 引数削除ロジック
- `src/ops/updateInterface.ts` — プロパティ削除ロジック
- `src/router.ts` — ルーティング更新（既存の switch case 内で処理）
- テストファイルの新規追加

#### 実装タスク

- `updateFunctionSchema` の `changes` に `remove_param: { name: string }` を追加する
- `updateInterfaceSchema` の `changes` に `remove_property: { name: string }` を追加する
- `changes` 内で `add_*` と `remove_*` は排他にする（同時指定はバリデーションエラー）
- 削除対象が存在しない場合は no-op とする（冪等性の維持）
- 名前が曖昧一致する場合や複数候補がある場合はエラーにする

#### 完了条件

- [ ] 関数引数の削除ができ、削除後のコードが構文的に正しい
- [ ] interface プロパティの削除ができ、削除後のコードが構文的に正しい
- [ ] 存在しない対象の削除は `changed: false` を返す（no-op）
- [ ] 既存の `add_param` / `add_property` テストが変更なしで通る

---

### 5.2 REQ-A06: `remove_import` のモジュール全体削除

#### 目的

named specifier だけでなく import 宣言全体も削除できるようにする。

#### 変更対象ファイル

- `src/schema/patch.ts` — `removeImportSchema` の `named` を optional に変更
- `src/ops/removeImport.ts` — モジュール単位削除ロジック
- テストファイルの新規追加

#### 実装タスク

- `removeImportSchema` の `named` を `z.array(namedImportSchema).min(1).optional()` に変更する
- `named` 省略時は対象モジュールの import 宣言全体を削除する
- default import (`import x from '...'`) のみの宣言も削除対象にする
- namespace import (`import * as x from '...'`) のみの宣言も削除対象にする
- 同一モジュールに複数の import 宣言がある場合はすべて削除する

#### 完了条件

- [ ] `named` 省略時に import 宣言全体を削除できる
- [ ] `named` 指定時は従来通り部分削除として動作する（後方互換）
- [ ] default import / namespace import を含む宣言の削除テストが通る
- [ ] 既存の `remove_import` テスト (`phase3.test.ts`) が変更なしで通る

---

## 6. Phase 3: 効率化

### 6.1 REQ-A04: バッチ解析 API

#### 目的

複数 target をまとめて解析し、MCP ツール呼び出しの往復回数を減らす。

#### 変更対象ファイル

- `src/engine/references.ts` — バッチ解析関数の追加
- `src/mcp/server.ts` — `batch_analyze_references` ツールの登録
- テストファイルの新規追加

#### 実装タスク

- `batchAnalyzeReferences` 関数を追加する
  - 入力: `sourceText` + `targets: ReferenceTarget[]`（テキスト版）
  - 入力: `filePath` + `targets: ReferenceTarget[]`（ファイル版）
  - 入力: `projectRoot` + `entryFile` + `targets: ReferenceTarget[]`（横断版、REQ-A01 前提）
- 1 回のファイル読み込み・`Project` 構築で複数 target を処理する
- 戻り値は `Map<string, ReferenceAnalysis>` または target ごとの配列
- 単発 API と結果が一致することを保証する
- MCP ツール `batch_analyze_references` を登録する

#### 完了条件

- [ ] 3 target 以上を 1 回の呼び出しで解析できる
- [ ] 単発 API で同じ target を個別解析した結果と一致する
- [ ] MCP ツールとして登録されている

#### 依存

REQ-A01（プロジェクト横断版を含む場合）。テキスト版・ファイル版は REQ-A01 なしでも実装可能。

---

## 7. Phase 4: 将来拡張

### 7.1 REQ-A07: `rename_symbol`

#### 目的

シンボル名変更を AST ベースで安全に適用する。

#### 前提条件

REQ-A01（プロジェクト横断参照）が完了していること。

#### 実装タスク

- `rename_symbol` 用の patch operation スキーマを追加する
  - 入力: `file`, `target` (kind + name), `newName`
- 対象シンボルの定義箇所と全参照箇所を更新する
- プロジェクト横断で参照を追跡し、他ファイルの import / 利用箇所も更新する
- 変更結果はファイルごとの diff で返す

#### 完了条件

- [ ] シンボル名変更を AST ベースで適用できる
- [ ] 他ファイルの参照も含めて更新される
- [ ] 変更前後で構文エラーが発生しない

---

## 8. 技術設計メモ

### 8.1 `project.ts` の拡張（REQ-A01 向け）

現在の `loadSourceDocumentFromText` / `loadSourceDocumentFromFile` はいずれも `useInMemoryFileSystem: true` で `Project` を構築している。横断参照には tsconfig を解決できるディスクベースの `Project` が必要。

- `loadSourceDocumentFromText` は維持する（単一ファイル操作用）
- ディスクベースの `Project` を構築する新関数を追加する
  - tsconfig.json を読み込み、ファイルシステムから SourceFile を解決する
  - 初回構築のコストが高いため、キャッシュ戦略を検討する

### 8.2 `references.ts` の拡張（REQ-A03, REQ-A01 向け）

- `ReferenceAnalysis` に `isExported` と `exportKind` を追加する（REQ-A03）
- `ReferenceLocation` に `file?: string` と `isDefinition?: boolean` を追加する（REQ-A01）
  - 単一ファイル解析時はこれらを省略し、後方互換を保つ
- クロスファイル探索は `analyzeReferencesFromProject` のような別関数に分離する

### 8.3 `diff.ts` の拡張（REQ-A02 向け）

- 現在は `createPatchDiff`（diff 生成）のみ。diff 解析関数を同ファイルに追加する
- unified diff をパースし、変更行を特定 → sourceText の AST と突合する構成

### 8.4 `schema/patch.ts` の拡張（REQ-A05, REQ-A06 向け）

- `updateFunctionSchema` の `changes` を union 化: `add_param` | `remove_param`
- `updateInterfaceSchema` の `changes` を union 化: `add_property` | `remove_property`
- `removeImportSchema` の `named` を optional にする

### 8.5 `mcp/server.ts` の拡張

| REQ | 追加ツール |
|-----|-----------|
| REQ-A01 | `analyze_references_from_project` |
| REQ-A04 | `batch_analyze_references` |

既存の 6 ツールは変更なし。入力検証は Zod スキーマ、エラー形式は `toToolErrorResult` を踏襲する。

---

## 9. リスクと対策

| # | リスク | 対象 REQ | 対策 |
|---|--------|----------|------|
| 1 | プロジェクト横断解析の性能劣化 | REQ-A01, REQ-A04 | `maxDepth` で探索範囲を制限する。`Project` のキャッシュを検討する |
| 2 | export 判定の曖昧さ（re-export 等） | REQ-A03 | `named` / `default` / `namespace` を明示的に分け、判定不能時は `null` を返す |
| 3 | diff からのシンボル抽出の誤判定 | REQ-A02 | AST ベースの突合を優先し、行番号のみの推定は補助的に使う |
| 4 | 削除系操作の冪等性破壊 | REQ-A05, REQ-A06 | 対象不在時は no-op、曖昧一致はエラー。テストで冪等性を検証する |
| 5 | 利用者との仕様ズレ | 全体 | MCP レスポンス形式を固定し、`contract.test.ts` で LIB/MCP の一貫性を検証する |

---

## 10. 完了基準

本計画のすべての REQ が完了した時点で、以下が成立していること。

- [ ] 参照解析が単一ファイルと複数ファイルの両方で動作する（REQ-A01）
- [ ] diff から変更シンボルを AST ベースで抽出できる（REQ-A02）
- [ ] export 情報を含めた解析結果を返せる（REQ-A03）
- [ ] 関数引数・interface プロパティの削除ができる（REQ-A05）
- [ ] import 宣言全体の削除ができる（REQ-A06）
- [ ] バッチ解析で MCP 往復を削減できる（REQ-A04）
- [ ] 既存の 48 テストがすべて通る（後方互換）
- [ ] 新規 REQ ごとにテストが追加されている


