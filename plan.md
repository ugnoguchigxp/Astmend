# Astmend プロジェクト計画（Semantic Patch Engine）

---

## 1. 目的

**Astmend** は、TypeScriptコードに対してAST（抽象構文木）ベースで安全な変更を行うためのエンジンである。

* LLMによる不安定なテキスト編集を排除
* 構造を壊さない変更を保証
* diffベースで変更を可視化

---

## 2. スコープ

### 含む

* ASTベースコード変更
* JSON命令による操作
* 差分（diff）生成

### 含まない

* ファイル書き込み
* CLI実行
* MCP統合
* embedding / 検索

---

## 3. ゴール

### MVP

* 単一ファイル対象
* 関数 / interface変更可能
* diff出力

### 完成形

* 複数操作対応
* 冪等性保証
* 構造破壊ゼロ

---

## 4. アーキテクチャ

```text id="astmend-arch"
Input(JSON)
   ↓
Validator（zod）
   ↓
Patch Router
   ↓
Operation（AST操作）
   ↓
Diff Generator
   ↓
Output(diff)
```

---

## 5. 技術スタック

* TypeScript
* ts-morph
* zod
* diff

---

## 6. コア設計

---

### 6.1 命令フォーマット

```json id="astmend-json"
{
  "type": "update_function",
  "file": "src/userService.ts",
  "name": "getUser",
  "changes": {
    "add_param": {
      "name": "includeDeleted",
      "type": "boolean"
    }
  }
}
```

---

### 6.2 操作分類（初期）

* update_function
* update_interface

---

### 6.3 処理フロー

```text id="astmend-flow"
1. JSON検証
2. ファイル取得
3. AST解析
4. ノード特定
5. 操作実行
6. diff生成
```

---

## 7. 実装フェーズ

---

### Phase 1：MVP

#### 機能

* update_function（引数追加）
* update_interface（プロパティ追加）

#### 制約

* 単一ファイル
* 明示ターゲット必須

---

### Phase 2：安定化

#### 機能

* 重複チェック
* 型存在チェック

#### 品質

* エラー明確化
* フォーマット維持

---

### Phase 3：拡張

#### 操作追加

* add_import
* remove_import
* constructor変更

---

### Phase 4：構造理解

#### 機能

* 参照解析（findReferences）
* 影響範囲検出

---

## 8. 設計原則

---

### 8.1 副作用禁止

* ファイル保存禁止
* メモリ内処理のみ

---

### 8.2 冪等性

* 同一命令で状態不変

---

### 8.3 明示性

* 曖昧指定禁止

---

### 8.4 局所性

* 初期は単一ファイル限定

---

### 8.5 最小差分

* 不要変更禁止

---

## 9. モジュール構成

```text id="astmend-structure"
src/
 ├─ schema/
 ├─ engine/
 │   ├─ project.ts
 │   ├─ diff.ts
 │   └─ guards.ts
 ├─ ops/
 │   ├─ updateFunction.ts
 │   ├─ updateInterface.ts
 │   └─ addImport.ts
 ├─ router.ts
 └─ index.ts
```

---

## 10. リスクと対策

---

### リスク：対象未検出

→ fail-fast + 明確エラー

---

### リスク：重複変更

→ 事前チェック

---

### リスク：フォーマット崩れ

→ ts-morph + formatter

---

## 11. 成功指標

* diff精度
* 冪等性
* エラー率低下
* 手動修正削減

---

## 12. 拡張方針

---

### 短期

* 操作追加

### 中期

* 参照解析

### 長期

* DSL化

---

## 13. 本質

> Astmendは「コードを書くツール」ではなく
> **「コードを壊さずに変更するエンジン」**

---

## 14. 設計の核心

```text id="astmend-core"
入力 = 意図（JSON）
処理 = AST操作
出力 = diff
```

---

## 15. 命名と配布方針

### パッケージ名候補

* astmend
* astmend-core
* @your-scope/astmend

### コンセプト

* backend専用
* UIなし
* エンジン特化

---

## 最終まとめ

Astmendは：

* シンプル
* 安全
* 拡張可能

なSemantic Patchエンジンであり、
Vibe Codingにおける「破壊防止レイヤ」として機能する。

