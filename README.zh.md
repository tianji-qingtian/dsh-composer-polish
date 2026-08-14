# dsh-composer-polish

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）输入框的一键草稿润色插件。在输入框写一段啰嗦的草稿，点工具行里的 **✨ 润色** 按钮，几秒后润色好的文本直接替换输入框里的草稿——你预览、再改改、然后决定发送。不搞评测、不打分：草稿进，更好的草稿出。

> Harness 处于 developer preview，迭代很快——可能随其升级出现不兼容变更。

> English README: [README.md](README.md)。

## 特性

- **工具行里的 ✨ 按钮**——挂在 `conversation.input.right`，官方指定的"需要点击的东西"座位，紧挨发送按钮。草稿为空或纯空白时禁用，润色中转圈，双击不会重复触发。
- **零前缀 flash 改写**——host 端用单次 `deepseek-v4-flash` 流调用改写（`reasoningEffort: 'off'`，约 2000 token 上限），主模型完全不跑、前缀缓存不碰。若固定模型 id 在 provider 目录里找不到，会通过 `llm.listModels` 找一次 flash 类模型重试。
- **回填输入框，不是发消息**——润色结果通过官方唯一公开写入路径 `inputActions.setDraft` 填回输入框。你可以继续编辑，也可以再润一次；不按发送不会发出任何东西。带图片的草稿只润文字，图片不动、不丢。
- **失败静默**——改写失败或返回空时草稿原样不动（只写 console 日志，不弹窗）。
- **隐私**——`/polish` 命令注册时设 `recordInput: false`，草稿原文不进会话日志；只有润色结果会记录在 `command/done`。
- **不造新协议**——Client→Host 复用 harness 内置的 `commands` remote（和内置 `/` 命令走同一条路）。
- **中英双语 UI**——按钮文案、tooltip 跟随 harness 的 `locale` 服务。
- **跟随草稿语言与语气**——改写用草稿的语言作答，并**保留作者语气**（去掉口水话，但不会改得更正式、更营销腔、更机器腔）；代码块、文件路径、命令行、标识符、技术术语原样保留。

## 安装

### 前置条件

`dsh` CLI 必须在 `PATH` 上。如果你只通过 `npx` 跑过 harness，`dsh` 其实没装，会报 `zsh: command not found: dsh`——先全局装一次：

```sh
npm install -g @deepseek-ai/dsh
```

`pnpm add -g @deepseek-ai/dsh` 也可以，前提是你的 pnpm 全局 bin 目录在 `PATH` 上（否则 pnpm 会提示先跑 `pnpm setup`）。不想全局装的话，给下面的命令加 `npx @deepseek-ai/dsh …` 前缀即可。

### 加入 profile bundle

```sh
# 1. 把 bundle 加进 web profile（pnpm 托管；仓库里提交了构建好的 lib/ 产物，
#    安装时不跑构建脚本）
dsh plugin --profile web add "github:tianji-qingtian/dsh-composer-polish#v0.1.3"

# 2. 用该 profile 重启 harness —— add 只改 profile 文件，
#    已运行的实例不会热加载新 bundle
dsh --profile web
```

重启后 ✨ 按钮出现在输入框工具行发送按钮旁边，host 半载入后 `/polish` 命令注册。可在 Settings → Plugins 里确认 `dsh-composer-polish` 已列出。

## 工作原理

| 环节 | 机制 |
| --- | --- |
| 按钮座位 | `conversation.input.right` 列表 slot（session scope）；标准 kit 的 selector hook `useInput((s) => s)` 读草稿，`inputActions.setDraft()` 写回 |
| Client → Host | 内置 `commands` remote，硬注入（`inject: ['remote', 'remote.commands']`）：`ctx.remote.commands.execute(sessionId, '/polish ' + draft)`——和内置斜杠命令同一往返通道，无自定义 RPC |
| Host 改写 | `/polish` 命令 handler → 零前缀 `ctx.llm.stream`（`deepseek-official` / `deepseek-v4-flash`，`reasoningEffort: 'off'`，`maxTokens` 2000），固定模型缺失时用目录里发现的 flash 类模型重试一次 |
| 结果通道 | handler 返回 `{ kind: 'success', text }`；client 从 `CommandExecution.result.text` 取出，`setDraft` 回填 |
| 隐私 | `recordInput: false` → `command/run` 不写 `args`，草稿原文永不落会话日志 |
| 防覆盖 | client 在点击时记下 `draftRev`；润色期间草稿变了就丢弃结果，不覆盖更新的编辑 |
| 长度上限 | 两端都按 50 KB 封顶；超长草稿在 client 端截断后再送 |

## 行为规格（来自 REQUIREMENTS.md）

| # | 场景 | 行为 |
| --- | --- | --- |
| 1 | 草稿非空，点 ✨ | 读草稿 → flash 改写 → 回填 |
| 2 | 草稿为空/纯空白 | 按钮禁用 |
| 3 | 改写失败/返回空 | 草稿不动，仅 console 日志，无弹窗 |
| 4 | 改写进行中 | 按钮转圈，禁止重复触发 |
| 5 | 草稿含图片附件 | 只润文字；图片不动、不丢 |
| 6 | 中/英文草稿 | 按草稿语言改写 |
| 7 | 代码块/列表/技术术语 | 结构保留、代码原样、不改技术准确性 |

## 构建

```sh
pnpm install
pnpm build   # tsdown：lib/index.js（ESM host）+ lib/client.js（ModuleLoader client bundle）
```

## 已知限制

- 润色期间草稿被继续编辑时，结果会被丢弃（防覆盖）——这是有意设计，你更新的编辑永远赢。
- 超过 50 KB 的草稿发送前截断（这个体量也超出单次 flash 调用能合理重排的范围了）。
- 润色结果会记在 `command/done`（commands 通道自身的生命周期日志）；通过 `recordInput: false` 挡在日志外的只是**原始草稿**。
- 改写模型固定为 `deepseek-v4-flash`；harness 若改了模型 id，目录回退会挑一个 flash 类替代并打一行日志。

## License

MIT
