# Automatic game sync on Windows

This tool was designed for a private working collection. It checks repository visibility and stops on a public destination. Players can run the games directly using the instructions in the [collection README](../../README.md).

This worker publishes saved source changes to the private `Shivamshaiv/board-and-card-games` repository. It runs under the signed-in Windows user every five minutes and at sign-in. Codex and the games can be closed.

| Source | Destination on the collection’s main branch |
| --- | --- |
| Clue working folder, excluding its Camel Up subfolder | `clue/` |
| The `camel-up/` subfolder in that workspace | `camel-up/` |
| The local Kachu working folder and `main` on `Shivamshaiv/Card_Games_RL-Kachuful` | `kachu/` |

Edits, additions, renames and deletions are picked up from the working files, including uncommitted work. Windows must be signed in with access to the source folders. GitHub connectivity and an authenticated `gh` session are required to publish. A missed or failed check retries on the next interval. The watcher does not write to the source checkouts or push to Kachu's original repository.

### Status and conflicts

Open `%LOCALAPPDATA%\ShivamBoardGameSync\status.json` for the last check time, collection commit, uploaded paths and pending conflicts. The Windows task is named **Shivam Board and Card Games Sync**. Its exit code is 0 for a successful check, 1 for an error and 2 for a completed check with pending conflicts.

The worker compares each source to its last acknowledged version of that path. Independent edits made directly in the collection are preserved. If both sides change the same file differently, unrelated files still publish. To resolve, make the intended version identical in the source and collection, including deletion on both sides if intended. If two Kachu sources have competing edits, reconcile those versions too. A later check will clear the conflict.

Git ignore rules are honored for untracked files. Game saves, common credential files, dependency folders, build outputs and Python caches are excluded. The known original Kachu signing-key assignment is converted to the collection’s environment-based configuration on import. The collection root and this tools folder are outside the game mappings.

### Install or repair

Install Node.js 22 or later, Git and GitHub CLI. Sign in with `gh auth login` using an account with access to both private repos. In PowerShell, run the installer from this folder with the two existing project paths:

```powershell
.\install.ps1 -LocalRoot 'C:\path\to\Clue workspace' -KachuRoot 'C:\path\to\Kachu checkout'
```

The installer stores its worker, configuration, Git cache and baselines in `%LOCALAPPDATA%\ShivamBoardGameSync` and starts the task. Keep that folder when reinstalling. The first run pins the two source branches. If a checkout switches branches, sync pauses until it returns to its configured branch.

```powershell
Start-ScheduledTask -TaskName 'Shivam Board and Card Games Sync'
Get-Content "$env:LOCALAPPDATA\ShivamBoardGameSync\status.json"
```

Use `.\install.ps1 -Uninstall` to remove the schedule. The integration tests run against disposable local Git repositories with `node --test sync.test.mjs`.
