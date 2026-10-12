import {
  toLimit, bandText, initialState, decide, COMPACT_INSTRUCTIONS,
  readVerdict, countLines, trimVerdict, trimmedText, withStdout,
} from './logic.js'

let warnAt = 80
let compactAt = 90
let maxReadLines = 1000
let maxOutputLines = 400

let state = initialState()
let band = ''
let high = false

async function refresh($) {
  let usage
  try {
    usage = await $.session.usage()
  } catch {
    return
  }
  const text = bandText(usage)
  const d = decide(usage?.context?.percent, state, warnAt, compactAt)
  state = d.state
  if (d.warn) {
    $.ui.toast('context-saver: context is ' + Math.round(usage.context.percent) + '% full. A good moment to write a handoff and start a new session.')
  }
  if (d.compact) {
    $.ui.toast('context-saver: context is ' + Math.round(usage.context.percent) + '% full. Compacting now.')
    try {
      await $.session.compact({ instructions: COMPACT_INSTRUCTIONS })
    } catch {
      // the engine may refuse mid-turn; the next reading tries again
      state = { ...state, compacted: false }
    }
  }
  if (text !== band || d.high !== high) {
    band = text
    high = d.high
    $.ui.invalidate('ui.render')
  }
}

export function register(on, options) {
  warnAt = toLimit(options?.warnAt, 80)
  compactAt = toLimit(options?.compactAt, 90)
  maxReadLines = toLimit(options?.maxReadLines, 1000)
  maxOutputLines = toLimit(options?.maxOutputLines, 400)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    state = initialState()
    await refresh($)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!band) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text color={high ? 'yellow' : 'gray'}>{band}</Text>
      </Box>
    )
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    if (maxReadLines > 0 && typeof e.offset !== 'number' && typeof e.limit !== 'number' && e.file_path) {
      try {
        if (await $.fs.exists(e.file_path)) {
          const reason = readVerdict(e, countLines(await $.fs.read(e.file_path)), maxReadLines)
          if (reason) return { deny: reason }
        }
      } catch {
        // an unreadable file goes to the normal Read, which reports its own error
      }
    }
    return next(e)
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const res = await next(e)
    const v = trimVerdict(res?.result?.stdout, res?.isError, maxOutputLines)
    if (!v) return res
    let path = ''
    try {
      await $.fs.write(`${$.plugin.root}/outputs/last-output.txt`, res.result.stdout)
      path = `${$.plugin.root}/outputs/last-output.txt`
    } catch {
      path = ''
    }
    return withStdout(res, trimmedText(v, path))
  })
}
