# TablePro Windows

Windows port of TablePro — a fast, lightweight database client.

Built with **Tauri v2** (Rust backend) + **React 19** / **TypeScript** / **Tailwind CSS 4** (frontend).

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v20+)
- Windows 10/11 with WebView2 (pre-installed)

## Development

```bash
npm install
cargo tauri dev
```

## Build

```bash
cargo tauri build
```

Produces `.msi` and `.exe` (NSIS) installers in `src-tauri/target/release/bundle/`.

## Architecture

```
tablepro-windows/
├── src-tauri/          # Rust backend (Tauri commands, DB drivers, services)
│   └── src/
│       ├── commands/   # IPC command handlers
│       ├── database/   # DatabaseDriver trait + MySQL/PostgreSQL/SQLite
│       ├── models/     # Shared data structures
│       ├── services/   # Business logic
│       └── storage/    # Credentials, settings persistence
├── src/                # React frontend
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page-level components
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # Zustand state management
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions
├── package.json
└── vite.config.ts
```
