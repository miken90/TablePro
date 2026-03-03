# TablePro

A powerful, native database client for Windows — built with [Tauri v2](https://v2.tauri.app), React 19, and TypeScript.

Supports **PostgreSQL**, **MySQL**, and **SQLite** with SSH tunnel, AI chat, and a full-featured data grid.

## Features

- Multi-database: PostgreSQL, MySQL, SQLite
- SSH tunnel support
- AI-powered SQL assistant (OpenAI, Anthropic, Gemini, Ollama)
- Monaco-based SQL editor with Vim mode
- AG Grid data grid with inline editing & change tracking
- Export (CSV, JSON, SQL) / Import (SQL, CSV)
- Query history with full-text search
- Filter builder with quick search
- Table structure viewer (columns, indexes, foreign keys, DDL)
- Auto-update via Tauri updater
- License management (Keygen)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 |
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Backend | Rust |
| SQL Editor | Monaco Editor + monaco-vim |
| Data Grid | AG Grid |
| State | Zustand |
| DB Drivers | tokio-postgres, mysql_async, rusqlite |
| SSH | ssh2 (libssh2) |
| Build | Vite, cargo |

## Development

```bash
cd tablepro-windows
npm install
npx tauri dev
```

## Build (Windows)

```powershell
# Option 1: Build script
.\scripts\build-windows.ps1

# Option 2: Manual (from WSL or terminal with MSVC env)
cd tablepro-windows
npm run build
npx tauri build
```

Output:
- `src-tauri/target/release/tablepro-windows.exe`
- `src-tauri/target/release/bundle/msi/TablePro_*.msi`
- `src-tauri/target/release/bundle/nsis/TablePro_*-setup.exe`

## Project Structure

```
tablepro-windows/
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── pages/            # Main layout, Welcome, Settings
│   ├── stores/           # Zustand stores
│   ├── types/            # TypeScript types
│   ├── hooks/            # Custom hooks
│   └── utils/            # API bridge, theme
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── commands/     # Tauri commands (IPC)
│   │   ├── database/     # DB drivers (postgres, mysql, sqlite)
│   │   ├── services/     # AI, export, import, SSH, license
│   │   ├── storage/      # Connection, history, settings persistence
│   │   └── models/       # Shared data models
│   ├── icons/            # App icons
│   └── tauri.conf.json   # Tauri config
└── scripts/              # Build scripts
```

## License

See [LICENSE](LICENSE).
