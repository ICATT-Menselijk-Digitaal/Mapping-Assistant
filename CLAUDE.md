# Mapping Assistent

## Skills

Custom skills live in `.agents/skills/`. Invoke them with the Skill tool using the filename as the skill name (e.g. `wtf.implement-task`).

Two namespaces: `wtf.*` is the generic, reusable Epic→Feature→Task workflow — treat it as framework code, not a place for Mapping Assistant-specific process decisions. `map.*` (MAP = this project's own abbreviation) holds our own skills that layer on top of `wtf.*` for project-specific overrides (e.g. `map.implement-feature-with-single-task`). When a process decision only applies to this repo, add or extend a `map.*` skill rather than baking it into `CLAUDE.md` prose or editing a `wtf.*` skill directly.

**Planning a Feature's implementation:** use `map.implement-feature-with-single-task`, not `wtf.write-task` / `wtf.feature-to-tasks` directly. This repo always plans a Feature as a single Task on the Feature's own branch, regardless of Feature size.

## PowerShell UTF-8 encoding guard (Windows)

Before any `gh` command that reads or writes issue/PR bodies, MUST set UTF-8 encoding:

	[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
	[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
	$OutputEncoding            = [System.Text.Encoding]::UTF8

### Reading bodies

NEVER assign `gh` output directly to a PowerShell variable
(`$body = gh issue view ...`). PowerShell captures multi-line output as a
string array and joins lines with spaces, destroying all newlines.

Instead, write to a temp file first and read it back:

	$tmpFile = [System.IO.Path]::GetTempFileName()
	gh api repos/{owner}/{repo}/issues/{number} --jq .body > $tmpFile 2>&1
	$body = [System.IO.File]::ReadAllText($tmpFile, [System.Text.Encoding]::UTF8)
	Remove-Item $tmpFile

For known/reconstructed content, use PowerShell here-strings (`@' ... '@`)
which preserve newlines natively.

Always verify line count after reading before writing back:

	if (($body -split "`n").Count -lt 5) { throw "Body appears corrupted (no newlines)" }

### Writing bodies

MUST use a temp file with explicit UTF-8 (no BOM). Never pass bodies as
inline `--body` arguments — this prevents CP850 ↔ UTF-8 mojibake on Windows.

	$tempFile = [System.IO.Path]::GetTempFileName()
	[System.IO.File]::WriteAllText($tempFile, $body, [System.Text.UTF8Encoding]::new($false))
	gh issue edit <number> --body-file $tempFile
	Remove-Item $tempFile