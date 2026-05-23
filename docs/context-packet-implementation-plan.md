# Astmend 拡張計画: Context Packet 生成 API / CLI

最終更新: 2026-05-23

この文書は、Astmend に DiffGuard / MCP / LLM / security review harness 向けの context packet 生成機能を追加するための実装計画である。

今回の拡張は、Astmend を作り直すものではない。既存の TypeScript / ts-morph ベース AST engine、CodeUnit scanner、diff 解析、import/export graph、reference/impact 解析、MCP service を維持し、それらを組み合わせた小さく安定した JSON packet を返す API と CLI を追加する。

## 0. 基本方針

### 目的

- Git diff から changed file / changed range / changed symbol を整理する。
- 変更 symbol の周辺構造、import/export、reference、call-like relation を静的に取れる範囲で返す。
- Hono route、Drizzle query、review に役立つ lightweight risk hint を抽出する。
- DiffGuard / MCP / LLM が読みやすい JSON を library API と CLI stdout で返す。
- 解析不能な情報は throw ではなく `warnings` に寄せ、packet 自体は可能な限り返す。

### 非対象

- Semgrep / CodeQL 相当の SAST 実装。
- 脆弱性の最終判定。
- DiffGuard rule engine の内蔵。
- Skill.md の最終選択。
- memoryRouter への保存。
- PR コメント投稿。
- テスト実行 / Docker sandbox 管理。
- Astmend 専用 daemon の追加。
- package 分割や monorepo 化。

### 互換性方針

- 既存 package 名 `astmend` を維持する。
- 既存 exports `astmend` と `astmend/mcp/service` を壊さない。
- 既存 `createAstmendMcpService()` の service surface を維持する。
- `src/mcp/server.ts` は stdio adapter のまま維持し、context packet の中核実装を置かない。
- 新機能は additive に追加し、既存 API / MCP tool の戻り値を変更しない。

### パッケージ提供方針

Astmend は最終的に、以下 3 通りで使える npm package を目指す。

- library API: `import { createContextPacket } from 'astmend'`
- CLI: `npm install -g astmend` 後に `astmend context ...`
- MCP: npm package から `astmend mcp` または `astmend/mcp/service` を利用

公開面の優先順位は以下とする。

1. library API と `astmend/mcp/service` の import 互換。
2. `npx astmend ...` で使える CLI。
3. `npm install -g astmend` で使える global command。
4. MCP stdio adapter を CLI 経由で起動できること。

global install 型にする場合も、Astmend は daemon を常駐管理しない。MCP stdio adapter は呼び出し側の MCP host から起動される薄い実行入口として扱う。

MCP 対応は 2 段階に分けて判定する。

- MCP 起動互換: npm package から stdio adapter を起動できる。
- Context Packet MCP: MCP tool 経由で context packet / route / DB query / risk hint を取得できる。

公開 npm package の受け入れ条件には、Context Packet MCP まで含める。MCP 起動互換だけを満たす状態は中間マイルストーンとして扱い、公開完了とはしない。

## 1. 追加する公開 API

### 1.1 Context Packet API

対象ファイル:

- `src/context-packet/schema.ts`
- `src/context-packet/createContextPacket.ts`
- `src/index.ts`

追加 API:

```ts
export type ContextOptions = {
  repoRoot: string;
  base?: string;
  head?: string;
  diffFile?: string;
  includeSourceExcerpt?: boolean;
};

export async function createContextPacket(
  options: ContextOptions,
): Promise<ContextPacket>;
```

入力制約:

- `repoRoot` は必須。
- `base` / `head` 指定時は `git diff base...head` ではなく、まず `git diff base head` 相当の明示比較を使う。
- `head` 未指定時は `HEAD` を既定値にする。
- `diffFile` 指定時は diff text を読み込む。ただし before/after source を復元できない場合、changed symbol は best-effort とし、解析不能理由を `warnings` に入れる。
- `base` / `head` と `diffFile` が同時指定された場合は入力不正として CLI では終了コード 2、library API では `warnings` ではなく validation error とする。

### 1.2 補助 API

対象ファイル:

- `src/context-packet/routes.ts`
- `src/context-packet/dbQueries.ts`
- `src/context-packet/riskHints.ts`
- `src/index.ts`

追加 API:

```ts
export type ExtractionResult<T> = {
  items: T[];
  warnings: ContextWarning[];
};

export async function extractRoutes(options: {
  repoRoot: string;
  files?: string[];
}): Promise<ExtractionResult<RouteInfo>>;

export async function extractDbQueries(options: {
  repoRoot: string;
  files?: string[];
}): Promise<ExtractionResult<DbQueryInfo>>;

export async function extractRiskHints(options: {
  repoRoot: string;
  files?: string[];
}): Promise<ExtractionResult<RiskHintInfo>>;
```

方針:

- `files` 未指定時は project files から対象を走査する。
- `files` 指定時は repoRoot 相対パスを受け取り、該当ファイルだけを走査する。
- 個別 API は `items` と `warnings` を返す。parse failure / unsupported file / missing file は throw ではなく `warnings` に寄せる。
- `createContextPacket` は各補助 API の `warnings` を packet の `warnings` に集約する。
- CLI の `routes` / `db-queries` / `symbols` は JSON stdout に `items` と `warnings` を含める。

## 2. Context Packet 契約

対象ファイル:

- `src/context-packet/schema.ts`

`ContextPacket` は Zod schema と TypeScript 型を同じファイルで管理し、public API と CLI の出力を同じ schema で validation する。

最小 shape:

```json
{
  "schemaVersion": "0.1.0",
  "project": {
    "name": "example-app",
    "detectedStack": ["typescript"]
  },
  "diff": {
    "base": "main",
    "head": "HEAD",
    "changedFiles": []
  },
  "changedSymbols": [],
  "routes": [],
  "dbQueries": [],
  "callRelations": [],
  "riskHints": [],
  "recommendedSkills": [],
  "warnings": []
}
```

### 2.1 必須フィールド

- `schemaVersion`
- `project`
- `diff.changedFiles`
- `changedSymbols`
- `routes`
- `dbQueries`
- `callRelations`
- `riskHints`
- `recommendedSkills`
- `warnings`

### 2.2 フィールド方針

- `recommendedSkills` は互換フィールドとして空配列を許容する。Astmend は Skill.md の最終選択を行わない。
- `riskHints` は断定ではなく静的ヒントとして返す。
- `callRelations` は Phase 1 / Phase 2 では空配列を許容する。実装する場合は changed file 内の直接 call expression に限定する。
- source excerpt は `includeSourceExcerpt` が true の場合のみ付与する。
- packet 全体の validation 失敗は実装バグとして扱い、テストで検知する。

### 2.3 主要型

実装時に最低限定義する型:

- `ContextPacket`
- `ContextOptions`
- `ExtractionResult`
- `ContextWarning`
- `ChangedFileInfo`
- `ChangedRangeInfo`
- `ContextChangedSymbol`
- `RouteInfo`
- `DbQueryInfo`
- `CallRelationInfo`
- `RiskHintInfo`
- `SourceExcerptInfo`

## 3. 実装対象ファイル

### 3.1 新規ファイル

```text
src/
  context-packet/
    schema.ts
    createContextPacket.ts
    gitDiff.ts
    changedFiles.ts
    sourceExcerpt.ts
    routes.ts
    dbQueries.ts
    riskHints.ts
    callRelations.ts
  cli.ts
scripts/
  smoke-package.mjs
  smoke-global.mjs
test/
  context-packet.test.ts
  cli.test.ts
  route-extraction.test.ts
  db-query-extraction.test.ts
```

### 3.2 変更ファイル

- `package.json`
  - `bin` を追加する。
  - `files` を追加する。
  - `engines` を追加する。
  - `prepublishOnly` を追加する。
  - release / smoke scripts を追加する。
- `src/index.ts`
  - context packet API と型を export する。
- `src/mcp/service.ts`
  - context packet 系 tool を追加する。
- `README.md`
  - install、npx、global install、CLI、MCP、context packet の最小例を追加する。
- `mcp/README.md`
  - npm package から MCP service / stdio adapter として使う例を追加する。

## 4. Phase 1: npm / CLI 基盤

### 4.1 目的

CLI の入口と package 公開面を追加し、既存 library / MCP exports を壊さないことを確認する。

### 4.2 実装タスク

- `src/cli.ts` を追加する。
- `package.json` に以下を追加する。
  - `"bin": { "astmend": "./dist/cli.js" }`
  - `"files": ["dist", "README.md", "LICENSE", "mcp/README.md"]`
  - `"engines"` で対応 Node.js version を明記する。
  - `"prepublishOnly": "npm run release:check"`
  - `"release:check"` / `"smoke:dist"` / `"smoke:cli"` / `"smoke:mcp"` を追加する。
- `astmend version` を実装する。
- `astmend context --help` を実装する。
- `astmend mcp` を追加し、既存 `src/mcp/server.ts` の stdio server を起動できるようにする。
- unknown command / invalid option の終了コードを定義する。
  - usage error: `2`
  - unexpected runtime error: `1`
- CLI は stdout に machine-readable result を出し、エラーや usage は stderr に出す。
- README に install / global install / npx / CLI / MCP の最小例を追加する。

### 4.3 完了条件

- [ ] `node dist/cli.js version` が package version を出す。
- [ ] `node dist/cli.js context --help` が usage を出す。
- [ ] `node dist/cli.js mcp < /dev/null` が終了できる。
- [ ] `node -e "import('./dist/index.js')"` が通る。
- [ ] `node -e "import('./dist/mcp/service.js')"` が通る。
- [ ] `npm pack --dry-run` に必要ファイルが含まれる。
- [ ] `npm run smoke:dist` / `npm run smoke:cli` / `npm run smoke:mcp` が通る。

## 5. Phase 2: 最小 Context Packet

### 5.1 目的

Git diff から changed file / changed range / changed symbol を抽出し、schema validation 済みの JSON packet を CLI から stdout に出す。

### 5.2 実装タスク

- `schema.ts` に Zod schema と public 型を追加する。
- `gitDiff.ts` に diff 取得 helper を追加する。
  - `base` / `head` 指定時は `git diff --no-ext-diff --unified=3 base head` を使う。
  - `diffFile` 指定時はファイルから diff text を読む。
- `changedFiles.ts` に unified diff から changed file / changed range を抽出する helper を追加する。
- 既存 `analyzeChangedSymbolsFromDiff` を利用して changed symbol を抽出する。
- `base` 側 source は `git show base:path`、`head` 側 source は head が `HEAD` の場合は working tree ではなく `git show HEAD:path` を既定にする。
- Phase 2 の対象は commit-to-commit の TypeScript text file に限定する。
- working tree diff は Phase 2 では扱わない。必要になった場合は `--worktree` などの明示 option を別計画で追加する。
- `a/` / `b/` prefix は repoRoot 相対パスへ正規化する。
- rename は changed file に `changeKind: "renamed"` と `oldPath` / `newPath` を残し、symbol extraction は best-effort とする。
- deleted file は `changeKind: "deleted"` とし、head 側 source が無いため route / db query / risk hint 抽出対象から外す。
- binary file / unsupported extension は changed file と warning を返し、symbol extraction 対象から外す。
- empty diff は正常な packet として扱い、各配列を空にする。
- source excerpt を `includeSourceExcerpt` true のときだけ返す。
- `createContextPacket` は parse failure / missing file / unsupported extension を `warnings` に集約する。
- `astmend context --base main --head HEAD --format json` を実装する。
- `astmend context --diff-file ./diff.patch --format json` を実装する。

### 5.3 完了条件

- [ ] context packet が Zod schema validation を通る。
- [ ] CLI が JSON だけを stdout に出す。
- [ ] changed file / changed range が抽出できる。
- [ ] changed line から changed symbol を特定できる。
- [ ] diffFile mode で source 復元不能な場合に warning が返る。
- [ ] rename / deleted / binary / unsupported extension / empty diff の出力契約がテストされている。
- [ ] 既存 diff / scanner / MCP tests が退行しない。

## 6. Phase 3: Hono / Drizzle / Risk Hints

### 6.1 目的

review harness が優先的に見るべき route / DB query / risk signal を AST から軽量抽出する。

### 6.2 Hono route 抽出

対象ファイル:

- `src/context-packet/routes.ts`
- `test/route-extraction.test.ts`

検出対象:

- `app.get(...)`
- `app.post(...)`
- `app.put(...)`
- `app.patch(...)`
- `app.delete(...)`
- `route.get(...)`
- `route.post(...)`

返却情報:

- file
- line / column
- method
- path
- pathParams
- handlerName
- middlewareLikeArgs

制約:

- Hono 固有の完全解析はしない。
- 第一引数が string literal でない場合は path を `null` にし、warning を返せる形にする。

### 6.3 Drizzle query 抽出

対象ファイル:

- `src/context-packet/dbQueries.ts`
- `test/db-query-extraction.test.ts`

検出対象:

- `db.query.*`
- `db.select().from(...)`
- `db.insert(...)`
- `db.update(...)`
- `db.delete(...)`
- `sql\`...\``

返却情報:

- file
- line / column
- operation
- tableLikeName
- whereLikeText
- isRawSql
- enclosingSymbol

制約:

- Drizzle の型推論までは行わない。
- table 名が静的に分からない場合は `tableLikeName: null` とする。

### 6.4 Risk hints

対象ファイル:

- `src/context-packet/riskHints.ts`
- `test/context-packet.test.ts`

初期 hint:

- `id-parameter`
- `auth-middleware-not-detected`
- `id-only-query`
- `raw-sql`
- `external-fetch`
- `file-system-access`
- `admin-like-route`
- `delete-operation`
- `update-operation`

方針:

- hint は vulnerability finding ではない。
- 各 hint は `kind`, `severity`, `file`, `line`, `evidence`, `reason` を持つ。
- `severity` は `info` / `low` / `medium` に限定し、`high` / `critical` は使わない。
- route / db query / changed symbol の組み合わせで出せるものだけを出す。

### 6.5 完了条件

- [ ] Hono route を抽出できる。
- [ ] path params を抽出できる。
- [ ] middleware らしき引数を抽出できる。
- [ ] Drizzle query を抽出できる。
- [ ] raw SQL を hint として返せる。
- [ ] parse failure が warnings に入る。

## 7. Phase 4: MCP 連携

### 7.1 目的

共有 MCP host や DiffGuard が library API ではなく MCP 経由で context packet を取得できるようにする。

### 7.2 実装方針

MCP 連携は Phase 1-3 の API / CLI が安定してから追加する。公開 npm package の完了条件には Phase 4 を含める。

`src/mcp/service.ts` に tool を追加し、`src/mcp/server.ts` は stdio adapter のまま維持する。stdio adapter の起動入口は `node dist/mcp/server.js` と `astmend mcp` の両方を維持する。

tool 名は既存 service 内の命名に合わせ、prefix なしを基本とする。

追加 tool:

- `get_context`
- `extract_routes`
- `extract_db_queries`
- `get_risk_hints`

共有 host 側で tool 名衝突が問題になる場合だけ、host 側または別計画で prefix 付与を検討する。

### 7.3 完了条件

- [ ] `createAstmendMcpService().tools` に新規 tool が追加される。
- [ ] `callTool('get_context', ...)` が `toToolSuccessResult` 形式で packet を返す。
- [ ] `callTool('extract_routes', ...)` が `{ items, warnings }` を返す。
- [ ] `callTool('extract_db_queries', ...)` が `{ items, warnings }` を返す。
- [ ] `callTool('get_risk_hints', ...)` が `{ items, warnings }` を返す。
- [ ] schema validation error は `toToolErrorResult` に乗る。
- [ ] `node dist/cli.js mcp < /dev/null` が終了できる。
- [ ] `node dist/mcp/server.js < /dev/null` が終了できる。

## 8. CLI コマンド仕様

解析系コマンド (`context` / `symbols` / `routes` / `db-queries`) は `--format json` を既定とする。human-readable output は初期実装では追加しない。machine-readable output は stdout、usage / error は stderr に出す。

`version` は plain text の semver を stdout に出す。`mcp` は MCP protocol output のみを stdout に出す。

解析系コマンドの共通 option:

- `--repo-root <path>`: 省略時は `process.cwd()`。
- `--format json`: 初期は json のみ。
- `--help`: usage を stderr または stdout に出して exit code 0。

CLI として実装するコマンド:

```bash
astmend version
astmend context --base main --head HEAD --format json
astmend context --diff-file ./diff.patch --format json
astmend symbols --file src/routes/projects.ts --format json
astmend routes --format json
astmend db-queries --format json
astmend mcp
```

### 8.1 `astmend context`

- 入力:
  - `--repo-root <path>`
  - `--base <ref>`
  - `--head <ref>`
  - `--diff-file <path>`
  - `--include-source-excerpt`
  - `--format json`
- 出力:
  - `ContextPacket`
- 失敗:
  - invalid option / incompatible option は exit code 2。
  - unexpected runtime error は exit code 1。

### 8.2 `astmend symbols`

- 入力:
  - `--repo-root <path>`
  - `--file <path>` を必須とする。
  - `--include-non-exported`
  - `--format json`
- 出力:
  - `{ "items": CodeUnitInfo[], "warnings": ContextWarning[] }`
- 方針:
  - 既存 CodeUnit scanner を CLI から呼ぶ薄い wrapper とする。

### 8.3 `astmend routes`

- 入力:
  - `--repo-root <path>`
  - `--file <path>` は任意。複数指定を許可する。
  - `--format json`
- 出力:
  - `ExtractionResult<RouteInfo>`

### 8.4 `astmend db-queries`

- 入力:
  - `--repo-root <path>`
  - `--file <path>` は任意。複数指定を許可する。
  - `--format json`
- 出力:
  - `ExtractionResult<DbQueryInfo>`

### 8.5 `astmend mcp`

- 入力:
  - 追加 option なし。
- 動作:
  - 既存 stdio server を起動する。
  - stdin close 時に正常終了する。
- 出力:
  - MCP protocol output のみ。通常ログを stdout に混ぜない。

package 名は現行の `astmend` を維持するため、公開後の実行例は以下とする。

```bash
npx astmend context --base main --head HEAD --format json
npx astmend mcp
npm install -g astmend
astmend context --base main --head HEAD --format json
```

scoped package `@ugnoguchi/astmend` へ移行する場合は、package rename / npm publish / import compatibility を別計画として扱う。

## 9. テスト計画

### 9.1 Unit tests

- diff から changed file / changed range を抽出できる。
- changed line から changed symbol を特定できる。
- source excerpt が指定行の前後だけを返す。
- Hono route を抽出できる。
- Drizzle query を抽出できる。
- risk hint が route / query / source evidence に紐づく。
- parse failure が warning として返る。

### 9.2 API tests

- `createContextPacket` が schema validation 済み packet を返す。
- `extractRoutes` が `{ items, warnings }` を返し、files 指定時に対象ファイルだけを走査する。
- `extractDbQueries` が `{ items, warnings }` を返し、files 指定時に対象ファイルだけを走査する。
- `extractRiskHints` が `{ items, warnings }` を返し、unsupported file を warning 化できる。

### 9.3 CLI tests

- `node dist/cli.js version` が成功する。
- `node dist/cli.js context --help` が成功する。
- `node dist/cli.js context --base main --head HEAD --format json` が JSON を stdout に出す。
- `node dist/cli.js symbols --file <file> --format json` が `{ items, warnings }` を stdout に出す。
- `node dist/cli.js routes --format json` が `{ items, warnings }` を stdout に出す。
- `node dist/cli.js db-queries --format json` が `{ items, warnings }` を stdout に出す。
- `node dist/cli.js mcp < /dev/null` が正常終了する。
- invalid option は stderr と exit code 2 になる。
- runtime error は stderr と exit code 1 になる。

### 9.4 MCP tests

- `get_context` tool が context packet を返す。
- `extract_routes` / `extract_db_queries` / `get_risk_hints` tool が `{ items, warnings }` を返す。
- MCP tool input validation error が `toToolErrorResult` に乗る。
- `node dist/mcp/server.js < /dev/null` が正常終了する。

### 9.5 Compatibility tests

- 既存 `npm run check` が通る。
- 既存 `npm run build` が通る。
- `node -e "import('./dist/index.js')"` が通る。
- `node -e "import('./dist/mcp/service.js')"` が通る。
- `node dist/cli.js mcp < /dev/null` が通る。
- `node dist/mcp/server.js < /dev/null` が通る。

## 10. 品質・公開準備計画

### 10.1 品質ゲート

通常開発の完了判定は `npm run check` と `npm run build` だけで終えない。npm package として公開するため、以下を品質ゲートとして扱う。

- format: Biome format check が通る。
- lint: Biome lint が通る。
- typecheck: TypeScript strict が通る。
- unit/integration test: Vitest が通る。
- build: `tsc -p tsconfig.build.json` が通る。
- package smoke: build 後の `dist` import が通る。
- CLI smoke: `dist/cli.js` の主要 command が通る。
- MCP smoke: stdio adapter が stdin close で正常終了する。

`npm run check` は開発中の集約ゲート、公開前は `npm run build` と package smoke まで含む release gate として扱う。

package scripts は以下を追加する。

```json
{
  "scripts": {
    "release:check": "npm run check && npm run build && npm run smoke:dist && npm run smoke:cli && npm run smoke:mcp && npm pack --dry-run",
    "smoke:dist": "node -e \"import('./dist/index.js')\" && node -e \"import('./dist/mcp/service.js')\"",
    "smoke:cli": "node dist/cli.js version && node dist/cli.js context --help",
    "smoke:mcp": "node dist/cli.js mcp < /dev/null && node dist/mcp/server.js < /dev/null",
    "smoke:package": "npm run release:check && node scripts/smoke-package.mjs",
    "smoke:global": "node scripts/smoke-global.mjs"
  }
}
```

`smoke:global` は global npm state を変更するため、通常の `prepublishOnly` には含めない。release workflow または手動 release check で実行する。

### 10.2 CI 方針

GitHub Actions を追加する場合は、CI と publish を分離する。

- CI workflow:
  - `npm ci`
  - `npm run release:check`
- Release workflow:
  - tag または手動 dispatch を起点にする。
  - `npm ci`
  - `npm run release:check`
  - `npm run smoke:package`
  - `npm run smoke:global`
  - npm publish は release workflow 側だけで行う。

CI は package manager を npm に統一する。pnpm / bun 前提の workflow はこの repo では追加しない。

### 10.3 Package smoke

publish 前に tarball install の smoke を必須にする。

```bash
npm run smoke:package
```

`scripts/smoke-package.mjs` は一時ディレクトリを作成し、生成 tarball を install して以下を確認する。

```bash
npm init -y
npm install /path/to/astmend-*.tgz
node -e "import('astmend')"
node -e "import('astmend/mcp/service')"
npx astmend version
npx astmend context --help
npx astmend mcp < /dev/null
```

global install smoke も release 前に実施する。

```bash
npm run smoke:global
```

`scripts/smoke-global.mjs` は生成 tarball を global install し、`astmend version` / `astmend context --help` / `astmend mcp < /dev/null` を確認した後、global install を後片付けする。

### 10.4 MCP package readiness

MCP として使える npm package にするため、以下を公開前に確認する。

- `astmend/mcp/service` の export が `.d.ts` 付きで解決できる。
- `createAstmendMcpService()` が `name`, `version`, `tools`, `callTool` を返す。
- stdio adapter は `astmend mcp` と `node dist/mcp/server.js` の両方で起動できる。
- stdin close 時に process が残らない。
- MCP tool の error response は `structuredContent.code` と `message` を持つ。
- README と `mcp/README.md` に npm package からの利用例を記載する。

### 10.5 Release readiness

公開前に以下を確認する。

- `package.json` の `name`, `version`, `license`, `type`, `main`, `types`, `exports`, `bin`, `files`, `engines` が意図通り。
- `dist/cli.js` に shebang があり、global command として実行できる。
- `dist/index.d.ts` と `dist/mcp/service.d.ts` が生成される。
- `README.md` に install / npx / global install / CLI / MCP / context packet の例がある。
- `CHANGELOG.md` に公開内容が書かれている。
- `npm pack --dry-run` に不要な開発成果物や coverage が入らない。
- 既存 API / MCP tool の互換性を壊していない。

## 11. 受け入れゲート

実装完了の判定は以下を必須とする。

```bash
npm run release:check
node dist/cli.js version
node dist/cli.js context --help
node dist/cli.js context --base main --head HEAD --format json
node dist/cli.js mcp < /dev/null
node dist/mcp/server.js < /dev/null
node -e "import('./dist/index.js')"
node -e "import('./dist/mcp/service.js')"
```

公開 npm package の判定では Phase 4 の MCP tool 追加も必須とする。Phase 4 未実装の状態は中間マイルストーンとして扱う。

`context` の JSON には最低限以下を含める。

```text
schemaVersion
project
diff.changedFiles
changedSymbols
routes
dbQueries
callRelations
riskHints
recommendedSkills
warnings
```

公開前は追加で package smoke と global install smoke を通す。

```bash
npm run smoke:package
npm run smoke:global
```

## 12. リスクと対策

### リスク1: Context packet が大きくなりすぎる

- 対策:
  - source excerpt は opt-in にする。
  - full source は返さない。
  - changed files と relevant symbols を中心に絞る。

### リスク2: `diffFile` mode で changed symbol が不安定になる

- 対策:
  - before/after source が取れない場合は warning を返す。
  - changed ranges は diff text だけから返す。
  - symbol extraction は source がある場合のみ高信頼として扱う。

### リスク3: Risk hint が vulnerability finding と誤解される

- 対策:
  - field 名と README で lightweight hint であることを明記する。
  - severity は `info` / `low` / `medium` に限定する。
  - `auth-middleware-not-detected` のように断定を避ける命名にする。

### リスク4: MCP surface が肥大化する

- 対策:
  - Phase 4 は API / CLI 安定後に実装し、公開 npm package の完了条件に含める。
  - stdio server にはロジックを入れない。
  - tool 追加は `src/mcp/service.ts` に限定する。

### リスク5: npm package としては動くが global command が壊れる

- 対策:
  - `dist/cli.js` の shebang を確認する。
  - tarball install と global install の smoke を release gate に入れる。
  - stdout / stderr / exit code の CLI 契約をテストする。

### リスク6: MCP package として import できるが stdio 起動で残プロセスが出る

- 対策:
  - `node dist/cli.js mcp < /dev/null` と `node dist/mcp/server.js < /dev/null` を gate に入れる。
  - stdin close の lifecycle test を維持する。
  - long-running daemon 化を Astmend 側に入れない。

### リスク7: package smoke script が実環境の npm state を汚す

- 対策:
  - package install smoke は一時ディレクトリで実行する。
  - global install smoke は release workflow または手動 release check に限定する。
  - smoke helper は失敗時も uninstall / temp cleanup を試みる。

## 13. 実装順序

1. Phase 1: CLI / package 基盤。
2. Phase 2: schema と最小 context packet。
3. Phase 3: Hono / Drizzle / risk hints。
4. Phase 4: context packet MCP tool 追加。
5. README / `mcp/README.md` 更新。
6. package smoke / global install smoke / MCP smoke。

この順序なら、Astmend の既存 AST engine を維持しつつ、DiffGuard / MCP / LLM 側が先に CLI または library API で context packet を使い始められる。
