// Pure decisions, kept apart from the hooks so they can be tested directly.

export const HEAD_LINES = 150
export const TAIL_LINES = 50

// A setting arrives as text; anything that is not a number >= 0 falls back to the default.
export function toLimit(value, fallback) {
  const n = Number(String(value ?? '').trim())
  return String(value ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback
}

// The line above the prompt. A figure the engine does not report is left out, never shown as 0.
export function bandText(usage) {
  const parts = []
  const c = usage?.context?.percent
  if (typeof c === 'number') parts.push('context ' + Math.round(c) + '%')
  for (const [kind, label] of [['five_hour', '5h'], ['seven_day', 'week']]) {
    const w = (usage?.rateLimits || []).find((r) => r?.kind === kind)
    if (typeof w?.percentUsed === 'number') parts.push(label + ' ' + Math.round(w.percentUsed) + '%')
  }
  return parts.join(' · ')
}

export function initialState() {
  return { warned: false, compacted: false }
}

// What to do at this context fill. Each step fires once, and is armed again only after the fill
// drops back under the heads-up line (a compaction or /clear), so a long session can use it again.
export function decide(percent, state, warnAt, compactAt) {
  const next = { ...state }
  const out = { warn: false, compact: false, high: false, state: next }
  if (typeof percent !== 'number') return out
  const low = warnAt > 0 ? warnAt : compactAt
  if (low > 0 && percent < low) {
    next.warned = false
    next.compacted = false
    return out
  }
  out.high = true
  if (compactAt > 0 && percent >= compactAt && !state.compacted) {
    out.compact = true
    next.compacted = true
    next.warned = true
  } else if (warnAt > 0 && percent >= warnAt && !state.warned) {
    out.warn = true
    next.warned = true
  }
  return out
}

export const COMPACT_INSTRUCTIONS =
  'Keep: decisions made and why, work still open, files being changed, commands and checks that must be rerun, and pitfalls found. Drop: long tool output already acted on.'

const NOT_TEXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|avif|pdf|ipynb)$/i

// Whether a Read should be refused. Ranges and non-text files always pass.
export function readVerdict(args, lineCount, maxLines) {
  if (!(maxLines > 0)) return null
  if (typeof args?.offset === 'number' || typeof args?.limit === 'number') return null
  if (NOT_TEXT.test(String(args?.file_path || ''))) return null
  if (!(lineCount > maxLines)) return null
  return (
    'context-saver: this file has ' + lineCount + ' lines. Read a range with offset and limit, ' +
    'or search for the part you need with Grep, instead of reading it whole.'
  )
}

export function countLines(text) {
  if (!text) return 0
  return String(text).split(/\r?\n/).length
}

// Long output is cut to its head and tail. Output that failed, or that mentions an error or a
// failing test, is left whole: the line that matters may be in the middle.
export function trimVerdict(stdout, isError, maxLines) {
  if (!(maxLines > 0) || isError || typeof stdout !== 'string' || !stdout) return null
  if (/error|fail|traceback|panic|exception/i.test(stdout)) return null
  const lines = stdout.split(/\r?\n/)
  if (lines.length <= maxLines) return null
  return {
    head: lines.slice(0, HEAD_LINES).join('\n'),
    tail: lines.slice(-TAIL_LINES).join('\n'),
    omitted: lines.length - HEAD_LINES - TAIL_LINES,
    total: lines.length,
  }
}

export function trimmedText(v, savedPath) {
  const note = savedPath
    ? '[context-saver: ' + v.omitted + ' of ' + v.total + ' lines left out. Full output: ' + savedPath + ' — read a range of it if you need the middle]'
    : '[context-saver: ' + v.omitted + ' of ' + v.total + ' lines left out. The full output could not be saved; rerun with a narrower command if you need the middle]'
  return v.head + '\n' + note + '\n' + v.tail
}

// The engine's tool result with stdout replaced. `ref` and `text` are dropped so the engine shows the
// replaced result instead of the original one.
export function withStdout(res, stdout) {
  const { ref, text, ...rest } = res
  return { ...rest, result: { ...res.result, stdout } }
}
