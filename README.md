# context-saver

**A Claude Code mod that keeps sessions light, so you hit the context window and your usage limits later.**

I build with Claude Code every day on a weekly limit. Most of the waste I found came from three places: a session that had grown heavy before I noticed, one whole read of a 15,826-line type definition file, and `git status` or a log printing hundreds of lines Claude never needed. This mod handles those three.

## What it does

| | What happens |
|---|---|
| **A line above the prompt** | `context 72% · 5h 18% · week 41%`. It turns yellow once the context passes the heads-up line. A figure the engine does not report is left out instead of being shown as 0. |
| **A heads-up, then compaction** | At 80% context you get a one-time notice: a good moment to write a handoff and start fresh. At 90% the session is compacted once, told to keep decisions, open work, files being changed, checks to rerun and pitfalls. Both arm again after the context drops. |
| **No whole reads of huge files** | A `Read` without `offset` or `limit` on a text file over 1,000 lines is refused, with a hint to read a range or use Grep. Images, PDFs and notebooks pass. |
| **Long shell output cut** | Bash and PowerShell output over 400 lines reaches Claude as its first 150 and last 50 lines, with a note giving the path of the full text. Output from a failed command, or that mentions an error, a failure, a traceback, a panic or an exception, is left whole, because the line that matters may be in the middle. |

Every threshold is a setting, and 0 turns that part off.

## Install

```
/plugin marketplace add naoanao/context-saver
/plugin install context-saver@context-saver
```

It is also listed in the [shared-repo-guard](https://github.com/naoanao/shared-repo-guard) marketplace, so if you already added that one: `/plugin install context-saver@shared-repo-guard`.

| Setting | Default | What it means |
|---|---|---|
| Heads-up at (%) | 80 | Context fill for the one-time notice. |
| Compact at (%) | 90 | Context fill for the one-time compaction. |
| Largest whole-file read (lines) | 1000 | Longer text files must be read in ranges. |
| Longest shell output (lines) | 400 | Longer output is cut to head and tail. |

## What it reads, runs, and sends

- **Sends nothing.** No network requests, no telemetry.
- **Reads:**
  - the session's usage figures (`$.session.usage()`), the same ones the status line shows
  - a file Claude is about to read whole, only to count its lines
- **Runs:** nothing. It starts no processes.
- **Writes:** one file only, `outputs/last-output.txt` inside the mod's own folder: the full text of the most recent cut output, overwritten each time. Nothing that other tools run or read as settings or instructions.
- **Changes:**
  - it refuses a whole read of a long text file
  - it replaces long shell output with its head and tail
  - it asks the engine to compact the session once at the compaction line
- **Hooks:** `session.start` and `turn.complete` to read usage, `ui.render` for the line above the prompt, `tool.call` on Read, Bash and PowerShell.

## Limits

- Compaction summarizes the conversation. If you would rather decide yourself, set "Compact at" to 0 and keep the heads-up.
- The output cut looks at stdout only. A command that prints its bulk to stderr is not cut.
- The error check is a plain word match, so it leaves some clean output whole. It errs toward showing more.
- Counting a file's lines means reading it once inside the mod. That costs time, not context.

## Tests

13 tests (`claude plugin test` in this folder). Each guard was also checked the other way: with the refusal, the cut, or the once-only compaction removed, its test fails.

MIT license.
