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

// `commands` is a hard dependency so the plugin waits until the service is
// provided before apply() runs. A bare `ctx.get('commands')` here races the
// composition: with only `llm` injected, apply() can run before the commands
// registry exists, return undefined, and silently skip registration (the
// exact bug that left /polish unregistered while /router, from a plugin that
// happens to inject more services, worked).
export const inject = ['llm', 'commands']

const PROVIDER = 'deepseek-official'
const MODEL = 'deepseek-v4-flash'
const MAX_TOKENS = 2000
/** Hard draft cap; the client truncates at the same bound before sending. */
const MAX_DRAFT_LENGTH = 50 * 1024

const FLASH_RE = /(flash|chat|mini|turbo|haiku|lite|air|nano)/i
const STRONG_RE = /(pro|reasoner|opus|sonnet|max|ultra|premium|r1)/i

const POLISH_INSTRUCTIONS = [
  'You are a writing assistant that polishes a draft the user typed into a chat composer.',
  '',
  'Goal:',
  'Rewrite the draft so it is clearer, better organized, and more likely to get a good answer from an AI — without changing what it asks for.',
  '',
  'Preserve:',
  '- Keep the original intent, every factual detail, constraint, and requirement; never add or drop information.',
  '- Keep code blocks, file paths, command lines, error messages, identifiers, and technical terms exactly as written.',
  '- Match the draft\'s language; for mixed drafts, follow the dominant language.',
  "- Keep the user's voice: don't make it more formal, salesy, or robotic than the original.",
  '',
  'Improve:',
  '- Remove filler, rambling, and repetition; tighten the wording.',
  '- Fix grammar, typos, and unclear phrasing.',
  '- Reorganize only when it clarifies; use Markdown (headings/lists) only when it genuinely helps.',
  '- If the draft is already clear and well-organized, change as little as possible.',
  '',
  'Output:',
  '- Return ONLY the polished draft. No preamble, no explanations, no surrounding quotes, and no code fences.',
].join('\n')

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
      role: 'user',
      content: [{
        type: 'text',
        text: POLISH_INSTRUCTIONS + '\n\n<draft>\n' + draft + '\n</draft>',
      }],
      source: { kind: 'user' },
    }],
    maxTokens: MAX_TOKENS,
    reasoningEffort: 'off', // thinking would eat the token budget
    signal,
  })
  const blocks = []
  for await (const chunk of stream) {
    if (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'text'
      && typeof chunk.block.text === 'string') {
      blocks.push(chunk.block.text)
    }
  }
  return blocks.join('\n\n').trim()
}

/**
 * Fallback when the pinned model id is unavailable on the provider: pick a
 * flash-class id from the model catalog. Returns null when nothing matches.
 */
async function findFlashModel(ctx) {
  try {
    const models = await ctx.llm.listModels(PROVIDER)
    if (!Array.isArray(models)) return null
    for (const m of models) {
      const id = String((m && m.id) || '')
      if (id && FLASH_RE.test(id) && !STRONG_RE.test(id)) return id
    }
  } catch (error) {
    console.error(`dsh-composer-polish: model catalog failed for ${PROVIDER}: ${String(error)}`)
  }
  return null
}

export function apply(ctx) {
  ctx.commands.register({
    name: 'polish',
    description: 'rewrite the current composer draft for clarity and structure (normally invoked by the ✨ button)',
    input: { hint: 'draft text' },
    // The raw draft must never enter the session log: `command/run` omits
    // `args` when recordInput is false. Only the polished result is recorded
    // in `command/done`.
    recordInput: false,
    handler: async (invocation) => {
      // rawInput is everything after the command name, starting with the
      // separator whitespace the client added ('/polish ' + draft). Strip
      // exactly that one leading separator so the draft itself stays verbatim.
      const draft = String(invocation.rawInput || '').replace(/^[\t\n\r ]/, '')
      if (draft.trim().length === 0) {
        return { kind: 'error', text: 'nothing to polish' }
      }
      if (draft.length > MAX_DRAFT_LENGTH) {
        return { kind: 'error', text: 'draft too long to polish' }
      }

      const signal = invocation.signal
      try {
        let text = await polishOnce(ctx, draft, PROVIDER, MODEL, signal)
        if (text.length === 0) {
          // Pinned model id missing or muted — retry once with a flash-class
          // id from the same provider's catalog before giving up.
          const fallback = await findFlashModel(ctx)
          if (fallback !== null && fallback !== MODEL) {
            console.log(`dsh-composer-polish: ${MODEL} unavailable, retrying with ${fallback}`)
            text = await polishOnce(ctx, draft, PROVIDER, fallback, signal)
          }
        }
        if (text.length === 0) {
          return { kind: 'error', text: 'polish produced no text' }
        }
        return { kind: 'success', text }
      } catch (error) {
        if (signal && signal.aborted) throw error
        console.error(`dsh-composer-polish: polish failed: ${String(error)}`)
        return { kind: 'error', text: 'polish failed' }
      }
    },
  })
}
