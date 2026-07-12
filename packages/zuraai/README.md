# ZuraAI

Command-line launcher for the ZuraAI desktop app.

```sh
zuraai
zuraai open
zuraai chat "summarize this repo"
zuraai extension create ./my-extension com.example.my-extension
zuraai extension validate ./my-extension
zuraai extension build ./my-extension
zuraai extension test ./my-extension
```

The launcher supports macOS and Windows. Install the desktop app first, then use
`zuraai` from your terminal to open it.

Extension commands create and validate Phase 1 manifest packages without executing third-party
code. `build` and `test` are currently validation aliases. Import a validated package from Zura
Store while running the desktop app in development. The full authoring and security guide is in
the desktop repository at `docs/EXTENSIONS.md`.

Visit [zuraai.in](https://zuraai.in).
