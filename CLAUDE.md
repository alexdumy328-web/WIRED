# Working in this repo

## Multi-agent work: use T3 Code orchestration

When work needs more than one agent (reviews, councils, verification passes, parallel fixes, a new app or feature in its own branch), use the T3 Code orchestration tools, not the Claude Code `Workflow` tool.

- Run `orchestrator_capabilities` once per thread, before the first `delegate_task`, to see which providers and models are available.
- Use `delegate_task` for a child task. Pick the model the user names, put any settings in `target.options`, and use `isolation: "worktree"` when the child edits files in parallel with other work.
- Start a new top-level thread with `t3_thread_launch` only when the user asks for a separate thread. Send follow-ups with `t3_thread_send`, and read a thread with `t3_thread_read` before talking about it.
- Wait on children through the orchestration tools. Don't poll with sleep loops.
- If a provider or model isn't available, say so. Don't quietly fall back to another model or to `Workflow`.
