import { expect, test } from 'claude-code/testing'
import { toLimit, bandText, initialState, decide, readVerdict, trimVerdict, trimmedText } from '../hooks/logic.js'

test('settings: numbers pass, blanks and junk fall back, 0 stays 0', async () => {
  expect(toLimit('85', 80)).toBe(85)
  expect(toLimit('0', 80)).toBe(0)
  expect(toLimit('', 80)).toBe(80)
  expect(toLimit(undefined, 80)).toBe(80)
  expect(toLimit('-5', 80)).toBe(80)
  expect(toLimit('abc', 80)).toBe(80)
})

test('band: a figure the engine does not report is left out, not shown as 0', async () => {
  expect(bandText({ context: { percent: 41.6 }, rateLimits: [] })).toBe('context 42%')
  expect(bandText({ context: { window: 200000 }, rateLimits: [{ kind: 'seven_day', percentUsed: 12 }] })).toBe('week 12%')
  expect(bandText({
    context: { percent: 70 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 33.5 }, { kind: 'five_hour', percentUsed: 9 }],
  })).toBe('context 70% · 5h 9% · week 34%')
})

test('heads-up once at 80, compaction once at 90, both armed again after the fill drops', async () => {
  let s = initialState()
  let d = decide(79, s, 80, 90); s = d.state
  expect([d.warn, d.compact, d.high]).toEqual([false, false, false])
  d = decide(80, s, 80, 90); s = d.state
  expect([d.warn, d.compact]).toEqual([true, false])
  d = decide(85, s, 80, 90); s = d.state
  expect([d.warn, d.compact]).toEqual([false, false])
  d = decide(91, s, 80, 90); s = d.state
  expect([d.warn, d.compact]).toEqual([false, true])
  d = decide(95, s, 80, 90); s = d.state
  expect([d.warn, d.compact]).toEqual([false, false])
  d = decide(30, s, 80, 90); s = d.state
  d = decide(92, s, 80, 90)
  expect(d.compact).toBe(true)
})

test('a fill that jumps straight past both lines compacts without a separate heads-up', async () => {
  const d = decide(93, initialState(), 80, 90)
  expect([d.warn, d.compact]).toEqual([false, true])
})

test('0 turns each step off', async () => {
  expect(decide(99, initialState(), 0, 90).warn).toBe(false)
  expect(decide(99, initialState(), 80, 0).compact).toBe(false)
  expect(decide(99, initialState(), 80, 0).warn).toBe(true)
})

test('read: only a whole read of a long text file is refused', async () => {
  expect(readVerdict({ file_path: 'a.ts' }, 1001, 1000)).toContain('1001 lines')
  expect(readVerdict({ file_path: 'a.ts' }, 1000, 1000)).toBe(null)
  expect(readVerdict({ file_path: 'a.ts', offset: 1 }, 5000, 1000)).toBe(null)
  expect(readVerdict({ file_path: 'a.ts', limit: 50 }, 5000, 1000)).toBe(null)
  expect(readVerdict({ file_path: 'shot.PNG' }, 5000, 1000)).toBe(null)
  expect(readVerdict({ file_path: 'a.ts' }, 5000, 0)).toBe(null)
})

test('trim: long clean output is cut to head and tail; errors and failures stay whole', async () => {
  const long = Array.from({ length: 500 }, (_, i) => 'line ' + (i + 1)).join('\n')
  const v = trimVerdict(long, false, 400)
  expect(v?.omitted).toBe(300)
  const t = trimmedText(v!, '/x/output-0.txt')
  expect(t).toContain('line 150\n[context-saver: 300 of 500 lines left out. Full output: /x/output-0.txt')
  expect(t.endsWith('line 500')).toBe(true)
  expect(t).not.toContain('line 151\n')
  expect(trimVerdict(long, true, 400)).toBe(null)
  expect(trimVerdict(long + '\nTest FAILED', false, 400)).toBe(null)
  expect(trimVerdict(long, false, 500)).toBe(null)
  expect(trimVerdict(long, false, 0)).toBe(null)
})
