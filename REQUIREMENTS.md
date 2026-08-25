# dsh-composer-polish — 需求文档

> 状态：已开发并验收通过（v0.1.3），v0.1.4 为 harness 0.1.1 兼容修复。本文件是需求基线，实现见 `src/index.js`（host）与 `src/client/index.js`（client），验收记录见文末。

## 一句话目标

用户在对话框里写了一堆字，点一个按钮，插件把内容**改写优化**后**自动填回输入框**，用户预览后决定发送。不搞评测、不打分，纯"输入框草稿 → 润色 → 回填"。

## 用户故事

1. 用户在输入框写了一大段话（需求描述 / 提问草稿 / 中英混杂 / 口语化流水账）
2. 点输入框右侧的 **✨ 润色** 按钮
3. 按钮进入 loading（禁用 + 转圈）
4. 改写完成，优化后的文本**替换输入框草稿**（`setDraft`），用户直接看到、可再编辑
5. 用户满意后按发送；不满意可再点一次润色

## 行为规格

| # | 场景 | 行为 |
|---|---|---|
| 1 | 草稿非空，点润色 | 读草稿 → 送 flash 改写 → 回填 |
| 2 | 草稿为空/纯空白 | 按钮禁用（或点击无操作） |
| 3 | 改写调用失败/返回空 | 静默不动草稿（console 记日志），不做弹窗 |
| 4 | 改写进行中 | 按钮 loading，禁止重复触发 |
| 5 | 草稿含图片附件 | 只润色文本；图片不动、不丢 |
| 6 | 中文输入 | 用中文改写；英文输入用英文（跟随提问语言） |
| 7 | 代码块 / 列表 / 技术术语 | 保留结构，代码块原样保留，不改技术准确性 |

## 关键契约（已确认，全部现成）

- **读草稿**：slot 标准 prop `useInput((s) => s)` → `InputState.draft: string`（selector hook，必须传 selector）
- **写草稿**：slot 标准 prop `inputActions.setDraft(text: string): void`（官方唯一公开写入路径）
- **按钮位置**：`conversation.input.right`（session scope 工具行，官方文档指定"需要点击的东西放工具行"）
- **Host 往返**：静态插件没有 `host.call`，复用现成 remote——client 硬注入 `inject: ['remote', 'remote.commands']` 后 `ctx.remote.commands.execute(sessionId, '/polish ' + draft)`
- **Host 端改写**：`/polish` 命令 → `ctx.llm.stream`（provider=deepseek-official，model=deepseek-v4-flash，`reasoningEffort: 'off'`，`maxTokens` ~2000）；host 半硬注入 `inject: ['llm', 'commands']`
- **结果回传**：命令 handler 返回 `{ kind: 'success', text: 润色后文本 }`；client 从 `CommandExecution.result.text` 取出
- **隐私**：命令定义设 `recordInput: false`，草稿原文不进会话日志
- **i18n**：`locale` 服务注册 `zh`/`en` 字典（按钮 tooltip、busy 文案）
- **打包**：照抄 model-router——`package.json` 的 `dsh.bundle.patch` + `dsh.client` 声明、`cordis.patch.yml`、tsdown 双产物（`lib/index.js` ESM host + `lib/client.js` ModuleLoader bundle）

## 改写提示词（v0.1.3 最终版，host 端 `/polish` 命令内）

```
You are a writing assistant that polishes a draft the user typed into a chat composer.

Goal:
Rewrite the draft so it is clearer, better organized, and more likely to get a good answer from an AI — without changing what it asks for.

Preserve:
- Keep the original intent, every factual detail, constraint, and requirement; never add or drop information.
- Keep code blocks, file paths, command lines, error messages, identifiers, and technical terms exactly as written.
- Match the draft's language; for mixed drafts, follow the dominant language.
- Keep the user's voice: don't make it more formal, salesy, or robotic than the original.

Improve:
- Remove filler, rambling, and repetition; tighten the wording.
- Fix grammar, typos, and unclear phrasing.
- Reorganize only when it clarifies; use Markdown (headings/lists) only when it genuinely helps.
- If the draft is already clear and well-organized, change as little as possible.

Output:
- Return ONLY the polished draft. No preamble, no explanations, no surrounding quotes, and no code fences.
```

> 实际发送时，这段 instructions 后面拼 `<draft>...</draft>` 包裹的草稿原文，作为单条 user 消息。

## 验收清单

- [x] 写一段啰嗦文字 → 点 ✨ → 几秒后输入框出现优化文本，原文被替换
- [x] 空输入时按钮禁用
- [x] 连续点两次不会重复触发（loading 状态）
- [x] 英文草稿得到英文润色，中文得到中文
- [x] 带图片时图片不丢
- [x] 会话日志里搜不到草稿原文（`recordInput: false` 生效）
- [x] 中英 UI 切换正常（Settings → 语言）
- [x] `dsh plugin add` 安装 + 重启后按钮出现

> 验收结论（2026-08-14）：8 项全部通过。1–5、7、8 由用户在线实测确认；6 由开发者核实会话日志——8 条 `/polish` 的 `command/run` 事件均无 `args` 字段（`recordInput: false` 生效，草稿原文未进日志），`command/done` 仅含 `kind`/`text`（润色结果）。

## 待定项（已拍板）

1. 按钮文案：**两者**——`✨` 图标 + "润色/Polish" 文字（`locale` 字典）
2. 指定风格改写：v1 不做，只做通用润色
3. 长草稿上限：50 KB，超长在 client 端**静默截断**后发送（host 端同限双保险）
4. 独立建仓：是——`dsh-composer-polish` 独立 git 仓库（本目录）

## 实现备注（与基线差异）

- 提示词已按基线打磨：追加了"混排语言跟随主导语言""不输出引号包裹"两条细则，其余与基线一致。
- 新增**防覆盖守卫**（基线未要求）：点击时记 `draftRev`，润色期间草稿被继续编辑则丢弃结果，不回填——避免覆盖用户更新的编辑。
- 新增**模型回退**（基线未要求）：固定 `deepseek-v4-flash` 在 provider 目录缺失时，用 `listModels` 发现的 flash 类模型重试一次。
- **v0.1.0 → v0.1.1 修 bug**：`useInput` 是 selector hook，必须传 selector（官方写法 `useInput((s) => s)`）；v0.1.0 写成裸调用 `useInput()`，运行时抛 `w is not a function`，被 slot 错误边界捕获后退位（abdicate）整个条目——按钮不渲染且无任何报错提示。教训：slot 标准 props 里所有 `use*` 选择器 hook 都要带 selector 参数（`useProjection` 除外，它本身是 (key, selector) 形式）。
- **v0.1.1 → v0.1.2 修 bug**：host 半用 `ctx.get('commands')` 裸查会**竞态**——只 `inject: ['llm']` 时 apply 可能在 `commands` 服务就绪前执行，拿到 undefined 静默跳过注册（`/polish` 未注册，而 model-router 因注入更多服务跑得晚、`/router` 恰好注册成功）。修复：`inject: ['llm', 'commands']` 硬注入 + `ctx.commands.register(...)`。教训：apply 里要用到的服务一律硬注入，不要用可选裸查去拿"几乎必然存在"的服务。
- **v0.1.2 → v0.1.3 提示词优化**：按提示工程最佳实践重写 `POLISH_INSTRUCTIONS`——分节（Goal/Preserve/Improve/Output）、新增"保留作者语气（不要更正式/营销腔/机器腔）"、"已经很清晰就少改"的最小改动守卫、输出约束补"不要代码围栏"、保留清单补"标识符"。参考 Promptise / AI.gov.uk / OpenAI Academy / few-shot 指南。
- **v0.1.3 → v0.1.4 兼容 harness 0.1.1**：harness 0.1.1-rc.2 起 `remote.commands.execute` 签名变为 `(agentId, line, images, signal?)`——`images` 从 `line` 与 `signal` 之间插入，remote 绑定器对参数个数做严格校验（`client api: commands/execute expected 3 business argument(s) plus an optional AbortSignal`）。旧的两参数调用被直接抛错、按钮静默失效。修复：client 端改传 `execute(sessionId, '/polish ' + payload, [])`；peerDependencies 升到 `^0.1.1-rc.2`（`^0.1.0-rc.6` 语义上匹配不到 0.1.1 系列）。教训：升级 harness 后要按官方调用方（`dsh-client-ui-commands` 的 `execute(session, line, images = [])`）核对 remote 方法签名。

## 参考实现

- model-router 的按钮→`commands` remote 往返：`dsh-model-router/src/client/index.js`（setMode）
- model-router 的 `/router` 命令：`dsh-model-router/src/index.js`（commands.register）
- model-router 的 flash 零前缀调用：`answerOnCheap` / `flashJudge`（`reasoningEffort: 'off'`、block-end 收集、usage 捕获）
