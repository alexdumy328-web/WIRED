# Working in this repo

## Multi-agent work: use T3 Code orchestration

When work needs more than one agent (reviews, councils, verification passes, parallel fixes, a new app or feature in its own branch), use the T3 Code orchestration tools, not the Claude Code `Workflow` tool.

- Run `orchestrator_capabilities` once per thread, before the first `delegate_task`, to see which providers and models are available.
- Use `delegate_task` for a child task. Pick the model the user names, put any settings in `target.options`, and use `isolation: "worktree"` when the child edits files in parallel with other work.
- Start a new top-level thread with `t3_thread_launch` only when the user asks for a separate thread. Send follow-ups with `t3_thread_send`, and read a thread with `t3_thread_read` before talking about it.
- Wait on children through the orchestration tools. Don't poll with sleep loops.
- If a provider or model isn't available, say so. Don't quietly fall back to another model or to `Workflow`.

## Vercel

- Project `norgelis-tech` (team `alexdumy328-8710s-projects`), production domain `norgelis-tech.vercel.app`. Root Directory `site`, production branch `main`. Every merged PR deploys; every PR gets a preview.
- The API token is in the macOS Keychain, service `norgelis-vercel-token`. Read it with `security find-generic-password -s norgelis-vercel-token -w` and pass it as `Authorization: Bearer` to `api.vercel.com`, or as `VERCEL_TOKEN` to the CLI. Never write it into a file, a commit or a command that is logged.
- Production env vars are listed in `site/.env.example` and `ios/docs/app-store.md` (deploy checklist).
- The MongoDB Atlas Admin API key (project Norgelis Tech, group `6aff63e8b52495224e7e25c1`) is in the Keychain, service `norgelis-atlas-api-key`, as `public:private`. Use it with `curl --digest -u`. The project's network access allows `0.0.0.0/0` because Vercel's function IPs change.
