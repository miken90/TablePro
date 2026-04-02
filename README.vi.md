<p align="center">
  <img src=".github/assets/logo.png" width="128" height="128" alt="TablePro">
</p>

<h1 align="center">TablePro</h1>

<p align="center">
  Ứng dụng quản lý cơ sở dữ liệu với Windows là mục tiêu implement chính và macOS là upstream reference trong repo này.
</p>

<p align="center">
  <a href="https://docs.tablepro.app">Tài liệu</a> ·
  <a href="https://github.com/datlechin/tablepro/releases">Tải xuống</a> ·
  <a href="https://github.com/datlechin/tablepro/issues">Báo lỗi</a>
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
</p>

---

<p align="center">
  <img src=".github/assets/hero-dark.png" alt="TablePro Screenshot" width="800">
</p>

## Giới thiệu

Repository này có 2 codebase nền tảng:

- `TablePro/`: ứng dụng macOS (upstream/reference trong workflow hiện tại)
- `tablepro-windows/`: ứng dụng Windows đang được implement tích cực

Bản Windows dùng Tauri v2 + Rust + React/TypeScript và đã có các workflow chính: query theo session, schema explorer, inline editing + save changes, SQL import/export, SSH tunneling, auto-updater, AI chat, inline AI suggestions và connection health monitoring.

## Trạng thái nền tảng

| Nền tảng | Trạng thái trong repo | Tín hiệu version |
|---|---|---|
| macOS | Dòng sản phẩm ổn định, dùng làm upstream/reference trong workflow repo này | `CHANGELOG.md` |
| Windows | Bản pre-release đang được phát triển chính | `tablepro-windows/package.json` và `src-tauri/tauri.conf.json` |
| Linux | Kế hoạch tương lai | Chưa có target production trong repo |

## Tóm tắt tính năng Windows đã implement

- Quản lý connection: save/list/delete, group management, connect/disconnect theo session
- Driver hiện có trên Windows: PostgreSQL, MySQL, SQL Server, SQLite
- Query workflow: execute, cancel, paginated table browsing, progress events
- Data workflow: staged cell edits, SQL generation, save changes
- Import/Export: preview + import SQL, export CSV/JSON/SQL/XLSX
- Security: mã hóa DPAPI cho secret đã lưu, SSH host key verification (TOFU)
- AI: chat panel streaming, inline suggestions, provider/model settings, schema-aware context
- Reliability: health monitor với sự kiện `connection:lost` / `connection:reconnected` và reconnect action
- Updates: Tauri updater plugin cho release builds

## Tài liệu phát triển

- [Project Overview & PDR](docs/project-overview-pdr.md)
- [Codebase Summary](docs/codebase-summary.md)
- [System Architecture](docs/system-architecture.md)
- [Code Standards](docs/code-standards.md)
- [Project Roadmap](docs/project-roadmap.md)

## Nhà tài trợ

Cảm ơn những người đã hỗ trợ TablePro:

- **[Dwarves Foundation](https://dwarves.foundation/?ref=tablepro)**
- **[Nimbus](https://getnimbus.io?ref=tablepro)**
- **[Huy TQ](https://github.com/imhuytq)** — tài trợ Apple Developer Program
- **[Unikorn](https://unikorn.vn?ref=tablepro)**

## Lịch sử Star

[![Star History Chart](https://api.star-history.com/svg?repos=datlechin/TablePro&type=Date)](https://star-history.com/#datlechin/TablePro&Date)

## Giấy phép

Dự án này được cấp phép theo [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).

Đóng góp yêu cầu ký Contributor License Agreement (CLA). Xem [CLA.md](CLA.md) để biết thêm chi tiết.
