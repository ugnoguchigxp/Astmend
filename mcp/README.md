# Astmend MCP

このプロジェクトは共有 MCP ホストから in-process service として読み込めます。
開発・互換性確認用には `stdio` 方式の MCP サーバーも利用できます。

## 結論

- 通常の Codex ローカル実行では、Astmend 専用の長時間 stdio プロセスは不要です。
- 共有 MCP ホストは `createAstmendMcpService()` を import してツールを直接呼び出してください。
- `mcp:dev` / `mcp:start` は直接 stdio のデバッグ・互換性確認用です。

## セットアップ

1. 依存をインストールする。

```bash
npm install
```

2. サーバーをビルドする。

```bash
npm run build
```

3. host-facing service を確認する。

```bash
node -e "import('./dist/mcp/service.js').then(m => console.log(Object.keys(m)))"
```

4. 直接 stdio を確認する。

```bash
npm run mcp:start
```

開発中は `npm run mcp:dev` を使えます。

## 登録例

直接 stdio で登録する場合のフォーマットは MCP クライアントにより異なるため、まずは
`mcp/config.example.json` の形式をベースに設定してください。

ポイント:

- `command` は `node`
- `args` は `dist/mcp/server.js` の絶対パス
- `cwd` はこのリポジトリの絶対パス

共有ホストから使う場合は package root または `astmend/mcp/service` から
`createAstmendMcpService()` を import します。service は以下を返します。

- `name`
- `version`
- `tools`
- `callTool(name, args)`

## 提供ツール

- `apply_patch_to_text`
- `apply_patch_from_file`
- `analyze_references_from_text`
- `analyze_references_from_file`
- `analyze_references_from_project`
- `batch_analyze_references`
- `batch_analyze_references_from_text`
- `batch_analyze_references_from_file`
- `batch_analyze_references_from_project`
- `detect_impact_from_text`
- `detect_impact_from_file`
- `rename_symbol_from_text`
- `rename_symbol_from_file`

## 運用メモ

- 直接 stdio は stdin close / transport close に追従して終了します。
- Astmend 自体には watchdog を持たせず、共有ホスト側のライフサイクル管理に従います。
