import { expect, test } from 'claude-code/testing'

const LONG = Array.from({ length: 500 }, (_, i) => 'line ' + (i + 1)).join('\n')

// The engine around the mod: usage figures, files, toasts and compaction are all recorded here.
function fakeEngine(on, opts: { percent?: number; fileLines?: number; stdout?: string; isError?: boolean }) {
  const seen = { ran: [] as string[], toasts: [] as string[], compacts: 0, written: [] as string[] }
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('session.usage', async () => ({
    value: { startedAt: 0, context: { window: 200000, percent: opts.percent }, rateLimits: [{ kind: 'seven_day', percentUsed: 20 }] },
  }))
  on('session.compact', async () => {
    seen.compacts++
    return { skip: 'recorded by the test' }
  })
  on('ui.toast', async ($, e) => {
    seen.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('fs.exists', async () => ({ value: true }))
  on('fs.read', async () => ({ value: Array.from({ length: opts.fileLines ?? 10 }, () => 'x').join('\n') }))
  on('fs.write', async ($, e) => {
    seen.written.push(String(e.path))
    return { value: undefined }
  })
  on('tool.call', async ($, e) => {
    seen.ran.push(e.tool)
    const stdout = opts.stdout ?? 'ok'
    return { result: { stdout, stderr: '', interrupted: false }, isError: opts.isError, text: stdout }
  })
  return seen
}

async function start($) {
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
}

test('a whole read of a 1,200-line file is refused before it runs', async ($, on) => {
  const seen = fakeEngine(on, { fileLines: 1200 })
  await start($)
  const r = await $.tool.call({ tool: 'Read', file_path: '/repo/big.ts' })
  expect(seen.ran).toEqual([])
  expect(String(r.deny)).toContain('1200 lines')
})

test('a ranged read of the same file runs', async ($, on) => {
  const seen = fakeEngine(on, { fileLines: 1200 })
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/repo/big.ts', offset: 1, limit: 100 })
  expect(seen.ran).toEqual(['Read'])
})

test('500 lines of shell output reach Claude as head and tail, and the full text is saved', async ($, on) => {
  const seen = fakeEngine(on, { stdout: LONG })
  await start($)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls -R' })
  const out = String(r.result?.stdout)
  expect(out).toContain('line 150\n[context-saver: 300 of 500 lines left out')
  expect(out).not.toContain('line 151\n')
  expect(out.endsWith('line 500')).toBe(true)
  expect(seen.written.length).toBe(1)
  expect(seen.written[0].endsWith('last-output.txt')).toBe(true)
  expect(out).toContain('outputs/last-output.txt')
})

test('failed shell output is left whole', async ($, on) => {
  fakeEngine(on, { stdout: LONG, isError: true })
  await start($)
  const r = await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(String(r.result?.stdout)).toBe(LONG)
})

test('a session that starts 91% full is compacted once', async ($, on) => {
  const seen = fakeEngine(on, { percent: 91 })
  await start($)
  expect(seen.compacts).toBe(1)
})

test('a session at 85% gets a heads-up and is not compacted', async ($, on) => {
  const seen = fakeEngine(on, { percent: 85 })
  await start($)
  expect(seen.compacts).toBe(0)
  expect(seen.toasts.join(' ')).toContain('85% full')
})
