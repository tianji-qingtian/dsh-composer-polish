# dsh-composer-polish — 需求文档

> 状态：已开发（v0.1.0）。本文件是需求基线，实现见 `src/index.js`（host）与 `src/client/index.js`（client），验收记录见文末。

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

- **读草稿**：slot 标准 prop `useInput()` → `InputState.draft: string`
- **写草稿**：slot 标准 prop `inputActions.setDraft(text: string): void`（官方唯一公开写入路径）
- **按钮位置**：`conversation.input.right`（session scope 工具行，官方文档指定"需要点击的东西放工具行"）
- **Host 往返**：静态插件没有 `host.call`，复用现成 remote——`ctx.remote.commands.execute(sessionId, '/polish ' + draft)`（model-router 的按钮已验证此路可用）
- **Host 端改写**：`/polish` 命令 → `ctx.llm.stream`（provider=deepseek-official，model=deepseek-v4-flash，`reasoningEffort: 'off'`，`maxTokens` ~2000）
- **结果回传**：命令 handler 返回 `{ kind: 'success', text: 润色后文本 }`；client 从 `CommandExecution.result.text` 取出
- **隐私**：命令定义设 `recordInput: false`，草稿原文不进会话日志
- **i18n**：`locale` 服务注册 `zh`/`en` 字典（按钮 tooltip、busy 文案）
- **打包**：照抄 model-router——`package.json` 的 `dsh.bundle.patch` + `dsh.client` 声明、`cordis.patch.yml`、tsdown 双产物（`lib/index.js` ESM host + `lib/client.js` ModuleLoader bundle）

## 改写提示词（核心，需打磨）

初版草案（host 端 `/polish` 命令内）：

```
You are polishing a draft the user typed into the chat composer.
Rewrite it so it is clearer, better structured, and more likely to get a
good answer. Rules:
- Keep the original intent and ALL factual details, constraints and
  code; never add new requirements or drop information.
- Remove filler and rambling; make it concise.
- Keep code blocks, file paths, command lines, and technical terms verbatim.
- Use Markdown structure (headings/lists) only when it genuinely helps.
- Answer in the same language as the draft.
- Output ONLY the polished draft, no preamble, no explanation.
```

## 验收清单

- [ ] 写一段啰嗦文字 → 点 ✨ → 几秒后输入框出现优化文本，原文被替换
- [ ] 空输入时按钮禁用
- [ ] 连续点两次不会重复触发（loading 状态）
- [ ] 英文草稿得到英文润色，中文得到中文
- [ ] 带图片时图片不丢
- [ ] 会话日志里搜不到草稿原文（`recordInput: false` 生效）
- [ ] 中英 UI 切换正常（Settings → 语言）
- [ ] `dsh plugin add` 安装 + 重启后按钮出现

> 开发态验收：1/2/4/5/6 由代码路径保证（`useInput().draft` 读、`setDraft` 写、按钮 disabled、busy 锁、仅替换文本、提示词要求跟随草稿语言）；3 由静默错误分支 + console 日志保证；7 由 locale 注册 `zh`/`en` 字典保证。8 及端到端行为（真实改写效果）需安装发布后在线验收。

## 待定项（已拍板）

1. 按钮文案：**两者**——`✨` 图标 + "润色/Polish" 文字（`locale` 字典）
2. 指定风格改写：v1 不做，只做通用润色
3. 长草稿上限：50 KB，超长在 client 端**静默截断**后发送（host 端同限双保险）
4. 独立建仓：是——`dsh-composer-polish` 独立 git 仓库（本目录）

## 实现备注（与基线差异）

- 提示词已按基线打磨：追加了"混排语言跟随主导语言""不输出引号包裹"两条细则，其余与基线一致。
- 新增**防覆盖守卫**（基线未要求）：点击时记 `draftRev`，润色期间草稿被继续编辑则丢弃结果，不回填——避免覆盖用户更新的编辑。
- 新增**模型回退**（基线未要求）：固定 `deepseek-v4-flash` 在 provider 目录缺失时，用 `listModels` 发现的 flash 类模型重试一次。

## 参考实现

- model-router 的按钮→`commands` remote 往返：`dsh-model-router/src/client/index.js`（setMode）
- model-router 的 `/router` 命令：`dsh-model-router/src/index.js`（commands.register）
- model-router 的 flash 零前缀调用：`answerOnCheap` / `flashJudge`（`reasoningEffort: 'off'`、block-end 收集、usage 捕获）
