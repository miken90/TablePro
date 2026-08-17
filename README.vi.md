<p align="center">
  <img src="docs/logo/logo.png" width="128" height="128" alt="TablePro">
</p>

<h1 align="center">TablePro</h1>

<p align="center">
  Ứng dụng quản lý cơ sở dữ liệu cá nhân, phi lợi nhuận, chỉ dành cho Windows.
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
</p>

---

## Giới thiệu

TablePro là ứng dụng quản lý cơ sở dữ liệu chỉ dành cho Windows (`tablepro-windows/`), xây dựng bằng Tauri v2 + Rust + React/TypeScript. Đây là fork cá nhân đã tách hẳn khỏi upstream macOS — không còn code macOS nào trong repo này.

Gồm: query theo session, schema explorer, inline editing + save changes, SQL import/export, SSH tunneling, AI chat + inline AI, driver capability substrate, command registry với shortcut tùy chỉnh, deep-link, và 6 driver cơ sở dữ liệu compiled-in (PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, Redis). Không có pricing, licensing, activation, subscription, telemetry, hay auto-updater — vĩnh viễn ngoài phạm vi.

## Trạng thái nền tảng

| Nền tảng | Trạng thái | Phiên bản |
|---|---|---|
| Windows | Đang phát triển, nền tảng duy nhất được hỗ trợ | `tablepro-windows/package.json` / `src-tauri/tauri.conf.json`, hiện tại `0.7.0` |

## Tóm tắt tính năng Windows đã implement

- Quản lý connection: save/list/delete, group management, connect/disconnect theo session, reconnect do người dùng khởi tạo
- Driver: PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, Redis (6 driver, Rust crate compiled-in, không có hệ thống plugin/DLL)
- Driver capability substrate: file sidecar `.capabilities.json` cho từng driver, gating ở frontend qua `listDrivers`/`getDriverCapabilities`
- Query workflow: execute, cancel (chỉ SQLite), paginated table browsing, progress events, giới hạn payload (`MAX_RESULT_ROWS = 50,000`)
- MongoDB: find() với JSON filter/sort/limit, collection browser, BSON-to-row flattening
- Redis: CLI command panel (40+ lệnh), SCAN key browsing, đầy đủ kiểu dữ liệu, hỗ trợ TLS, chuyển đổi database
- Data workflow: staged cell edits, SQL generation, save changes
- Import/Export: preview + import SQL, export CSV/JSON/SQL/XLSX
- Security: mã hóa DPAPI cho secret đã lưu theo mặc định, tùy chọn đồng bộ Windows Credential Manager, SSH host key verification (TOFU)
- AI: chat panel streaming, inline suggestions, provider/model settings, schema-aware context
- Reliability: sự kiện `connection:lost` / `connection:reconnected`, reconnect do người dùng khởi tạo theo từng connection
- Command registry: 21 lệnh, shortcut tùy chỉnh với phát hiện xung đột và hoán đổi
- Deep-links: `tablepro://open/connection/{id}` và `tablepro://import?...`

## Tài liệu phát triển

- [Project Overview & PDR](docs/project-overview-pdr.md)
- [Codebase Summary](docs/codebase-summary.md)
- [System Architecture](docs/system-architecture.md)
- [Code Standards](docs/code-standards.md)
- [Project Roadmap](docs/project-roadmap.md)

## Giấy phép

Dự án này được cấp phép theo [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).
