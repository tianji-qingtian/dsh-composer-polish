// Quick behavioral test for the host /polish handler (no cordis runtime needed).
import { apply } from './lib/index.js'

const chunksFor = (text) => {
  async function* gen() {
    yield { type: 'block-end', block: { type: 'text', text } }
  }
  return gen()
}

const makeCtx = ({ streamImpl, models }) => {
  const registered = []
  const ctx = {
    llm: {
      stream: streamImpl,
      listModels: async () => models ?? [],
    },
    commands: {
      register: (def) => registered.push(def),
    },
  }
  apply(ctx)
  if (registered.length !== 1) throw new Error('expected one command registration, got ' + registered.length)
  return registered[0]
}

const expect = (label, got, want) => {
  if (got !== want) {
    console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
    process.exitCode = 1
  } else {
    console.log(`ok   ${label}`)
  }
}

// 1. happy path: draft arrives verbatim, polished text returned
let sawPrompt = null
let def = makeCtx({
  streamImpl: (opts) => {
    sawPrompt = opts.messages[0].content[0].text
    return chunksFor('Polished!')
  },
})
expect('recordInput', def.recordInput, false)
// protocol: client sends '/polish ' + draft → rawInput = ' ' + draft
let out = await def.handler({ rawInput: ' 你好\nline2', signal: new AbortController().signal })
expect('happy kind', out.kind, 'success')
expect('happy text', out.text, 'Polished!')
expect('draft verbatim in prompt', sawPrompt.endsWith('<draft>\n你好\nline2\n</draft>'), true)
expect('prompt has rules', sawPrompt.includes('Return ONLY the polished draft'), true)

// 2. empty draft → error
def = makeCtx({ streamImpl: () => { throw new Error('must not be called') } })
out = await def.handler({ rawInput: ' \n ', signal: new AbortController().signal })
expect('empty kind', out.kind, 'error')

// 3. empty stream → fallback via catalog → success
let calls = 0
def = makeCtx({
  streamImpl: (opts) => { calls++; return chunksFor(calls === 1 ? '' : 'From fallback') },
  models: [{ id: 'deepseek-chat' }],
})
out = await def.handler({ rawInput: ' hello', signal: new AbortController().signal })
expect('fallback kind', out.kind, 'success')
expect('fallback text', out.text, 'From fallback')
expect('fallback calls', calls, 2)

// 4. everything fails → error, no throw
def = makeCtx({
  streamImpl: () => { throw new Error('boom') },
  models: [],
})
out = await def.handler({ rawInput: ' hello', signal: new AbortController().signal })
expect('failure kind', out.kind, 'error')

// 5. over-long draft → error
def = makeCtx({ streamImpl: () => { throw new Error('must not be called') } })
out = await def.handler({ rawInput: 'x'.repeat(51 * 1024), signal: new AbortController().signal })
expect('long kind', out.kind, 'error')

console.log(process.exitCode ? 'FAILURES' : 'ALL OK')
