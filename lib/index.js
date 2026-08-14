//#region src/index.js
/**
* dsh-composer-polish — host half.
*
* Composer draft polisher for DeepSeek Harness.
*
* The browser half sends the current draft over the harness's built-in
* `commands` remote (`/polish <draft>`); this half rewrites it with a
* zero-prefix flash stream and hands the polished text back as the command
* result. The client fills it into the input box with `setDraft`.
*
* Privacy: the command declares `recordInput: false`, so the raw draft never
* lands in the session log (`command/run` omits `args`). Only the polished
* result appears in `command/done`.
*/
const inject = ["llm"];
const PROVIDER = "deepseek-official";
const MODEL = "deepseek-v4-flash";
const MAX_TOKENS = 2e3;
/** Hard draft cap; the client truncates at the same bound before sending. */
const MAX_DRAFT_LENGTH = 51200;
const FLASH_RE = /(flash|chat|mini|turbo|haiku|lite|air|nano)/i;
const STRONG_RE = /(pro|reasoner|opus|sonnet|max|ultra|premium|r1)/i;
const POLISH_INSTRUCTIONS = [
	"You are polishing a draft the user typed into a chat composer.",
	"Rewrite it so it is clearer, better organized, and more likely to get a good answer.",
	"",
	"Rules:",
	"- Keep the original intent and ALL factual details, constraints, and code; never add new requirements or drop information.",
	"- Remove filler and rambling; make it concise.",
	"- Keep code blocks, file paths, command lines, error messages, and technical terms verbatim.",
	"- Use Markdown structure (headings/lists) only when it genuinely helps.",
	"- Answer in the same language as the draft (for mixed-language drafts, follow the dominant language).",
	"- Output ONLY the polished draft — no preamble, no explanations, no surrounding quotes."
].join("\n");
/**
* One zero-prefix flash stream that turns the draft into the polished text.
* Returns the trimmed text, or an empty string when the stream produced
* nothing usable.
*/
async function polishOnce(ctx, draft, provider, model, signal) {
	const stream = ctx.llm.stream({
		provider,
		model,
		messages: [{
			id: `cpol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			role: "user",
			content: [{
				type: "text",
				text: POLISH_INSTRUCTIONS + "\n\n<draft>\n" + draft + "\n</draft>"
			}],
			source: { kind: "user" }
		}],
		maxTokens: MAX_TOKENS,
		reasoningEffort: "off",
		signal
	});
	const blocks = [];
	for await (const chunk of stream) if (chunk.type === "block-end" && chunk.block && chunk.block.type === "text" && typeof chunk.block.text === "string") blocks.push(chunk.block.text);
	return blocks.join("\n\n").trim();
}
/**
* Fallback when the pinned model id is unavailable on the provider: pick a
* flash-class id from the model catalog. Returns null when nothing matches.
*/
async function findFlashModel(ctx) {
	try {
		const models = await ctx.llm.listModels(PROVIDER);
		if (!Array.isArray(models)) return null;
		for (const m of models) {
			const id = String(m && m.id || "");
			if (id && FLASH_RE.test(id) && !STRONG_RE.test(id)) return id;
		}
	} catch (error) {
		console.error(`dsh-composer-polish: model catalog failed for ${PROVIDER}: ${String(error)}`);
	}
	return null;
}
function apply(ctx) {
	const commands = ctx.get("commands");
	if (commands === void 0) {
		console.error("dsh-composer-polish: commands service unavailable; /polish is not registered");
		return;
	}
	commands.register({
		name: "polish",
		description: "rewrite the current composer draft for clarity and structure (normally invoked by the ✨ button)",
		input: { hint: "draft text" },
		recordInput: false,
		handler: async (invocation) => {
			const draft = String(invocation.rawInput || "").replace(/^[\t\n\r ]/, "");
			if (draft.trim().length === 0) return {
				kind: "error",
				text: "nothing to polish"
			};
			if (draft.length > MAX_DRAFT_LENGTH) return {
				kind: "error",
				text: "draft too long to polish"
			};
			const signal = invocation.signal;
			try {
				let text = await polishOnce(ctx, draft, PROVIDER, MODEL, signal);
				if (text.length === 0) {
					const fallback = await findFlashModel(ctx);
					if (fallback !== null && fallback !== MODEL) {
						console.log(`dsh-composer-polish: ${MODEL} unavailable, retrying with ${fallback}`);
						text = await polishOnce(ctx, draft, PROVIDER, fallback, signal);
					}
				}
				if (text.length === 0) return {
					kind: "error",
					text: "polish produced no text"
				};
				return {
					kind: "success",
					text
				};
			} catch (error) {
				if (signal && signal.aborted) throw error;
				console.error(`dsh-composer-polish: polish failed: ${String(error)}`);
				return {
					kind: "error",
					text: "polish failed"
				};
			}
		}
	});
}
//#endregion
export { apply, inject };
