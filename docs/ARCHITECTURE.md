# Architecture

This repository's canonical architecture document is
[`system-architecture.md`](system-architecture.md), not this file.

`ARCHITECTURE.md` exists only because the harness inspector expects a file at
this path. This repo already had `system-architecture.md` (reconciled against
current source in commit `56524d89`, which also removed a fabricated
DLL-plugin-loader and health-monitor description) before the harness was
installed, and the harness naming convention is not authority to rename or
fork that document. Renaming it would break every existing internal link and
duplicate a document that is actively kept current; this pointer avoids both.

See `docs/system-architecture.md` for scope, source-of-truth file list, and
the current architecture description.
