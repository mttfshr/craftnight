---
name: craftnight-workflow
description: Git-based session workflow for craftnight development. Use when starting a new session, when user says "checkpoint" or "document this", or when managing session continuity.
---

# craftnight Development Workflow

Git commits are primary documentation.

## Session Initialization

When starting a new session:

1. **Read git history**
   ```bash
   git log -1
   ```

2. **Read HANDOFF.md** (if exists)
   - 3-5 lines maximum
   - Format: "Working on: X, Status: Y, Next: Z"

3. **Confirm understanding with user**
   ```
   Based on git log, last session: [summary]
   Ready to work on [specific next step]. Proceed?
   ```

## During Work

### Primary Documentation: Git Commits

```bash
git add -A
git commit -m "Session N: What you did

Changes:
- Specific change 1
- Specific change 2

Status: Current state
Next: What to do next"
```

## Checkpoint Commands

**"Checkpoint"** → Update HANDOFF.md (3-5 lines):
```
Working on: [current feature]
Status: [what's done]
Next: [what's needed]
```

**"ADR this decision"** → Create new ADR in `docs/decisions.md`

## Documentation Protocol

### Update HANDOFF.md when:
- User says "checkpoint"
- Session gets interrupted
- Never: at end of normal session

### Update docs/decisions.md when:
- Making new architectural decision
- User says "ADR this decision"

### Never create:
- ❌ SESSION_N_*.md files
- ❌ Duplicate info across git + files

## Project Structure

```
craftnight/
├── .specify/
│   └── constitution.md    # Source of truth
├── .claude/
│   └── skills/            # core, validator, workflow
├── docs/
│   └── decisions.md       # ADRs
├── HANDOFF.md             # Session continuity (3-5 lines)
└── [src]/                 # SvelteKit app
```

## Session End

Normal end:
1. Final commit with clear "Next:" section
2. Do NOT update HANDOFF.md

Interrupted:
1. Commit WIP
2. Update HANDOFF.md (3-5 lines)
