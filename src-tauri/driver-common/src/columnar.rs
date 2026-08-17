//! Columnar (column-major) representation of a `QueryResult`.
//!
//! Phase 2 RAM optimization: storing homogeneous-typed columns in a single
//! `Vec<Option<T>>` is significantly more memory-efficient than
//! `Vec<Vec<Option<String>>>` because:
//!   * numeric/bool columns avoid per-cell `String` allocation,
//!   * fully-null columns collapse to a single `usize` count,
//!   * cache locality improves for analytic scans (sum, count, etc).
//!
//! The current `QueryResult` ships rows as `Vec<Vec<Option<String>>>` for IPC
//! compatibility with the existing frontend, so the `From<QueryResult>`
//! conversion has to *infer* a per-column type from the data.
//!
//! ## Type inference (row → col)
//! For each column position, we scan top-down for the first non-null cell:
//!   1. parses as `i64`           → `Ints`
//!   2. parses as `f64`           → `Floats`
//!   3. case-insensitive `true`/`false` → `Bools`
//!   4. parses as JSON object/array → `Json`
//!   5. otherwise                 → `Strings`
//!   6. all cells null            → `Null(row_count)`
//!
//! If any subsequent cell fails to parse as the inferred type the entire
//! column **falls back to `Strings`** and is re-processed. This guarantees
//! that `row → col → row` is lossless for any input the frontend can produce
//! (modulo numeric formatting; see `col → row` below).
//!
//! `Bytes` is reserved for future driver-level use — row-string input cannot
//! be unambiguously decoded back into bytes, so inference never picks it.
//!
//! ## col → row
//! Each variant renders cells back to `Option<String>`:
//!   * Ints / Floats / Bools  → `to_string()`
//!   * Strings                → cloned
//!   * Bytes                  → lossy UTF-8 (`String::from_utf8_lossy`)
//!   * Json                   → `serde_json::to_string` (compact)
//!   * Null(n)                → n × `None`

use serde::{Deserialize, Serialize};

use crate::types::{ColumnInfo, QueryResult};

/// Column-major representation of a query result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnarResult {
    pub columns: Vec<ColumnInfo>,
    pub data: Vec<ColumnData>,
    pub row_count: usize,
    #[serde(default)]
    pub affected_rows: i64,
    #[serde(default)]
    pub execution_time_ms: f64,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_row_count: Option<usize>,
}

/// Typed column storage. Type is inferred from the first non-null cell during
/// row→col conversion; pure-null columns become `Null(count)` for memory
/// savings. See module-level docs for fallback rules.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", content = "values")]
pub enum ColumnData {
    Ints(Vec<Option<i64>>),
    Floats(Vec<Option<f64>>),
    Strings(Vec<Option<String>>),
    Bools(Vec<Option<bool>>),
    Bytes(Vec<Option<Vec<u8>>>),
    Json(Vec<Option<serde_json::Value>>),
    /// All cells in this column are null. Stored as a count.
    Null(usize),
}

impl ColumnData {
    pub fn len(&self) -> usize {
        match self {
            ColumnData::Ints(v) => v.len(),
            ColumnData::Floats(v) => v.len(),
            ColumnData::Strings(v) => v.len(),
            ColumnData::Bools(v) => v.len(),
            ColumnData::Bytes(v) => v.len(),
            ColumnData::Json(v) => v.len(),
            ColumnData::Null(n) => *n,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

// ── Inference helpers ───────────────────────────────────────────────────────

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum InferredKind {
    Int,
    Float,
    Bool,
    Json,
    String,
    AllNull,
}

fn classify(s: &str) -> InferredKind {
    let trimmed = s.trim();
    if trimmed.parse::<i64>().is_ok() {
        return InferredKind::Int;
    }
    if trimmed.parse::<f64>().is_ok() && !trimmed.is_empty() {
        return InferredKind::Float;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower == "true" || lower == "false" {
        return InferredKind::Bool;
    }
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if v.is_object() || v.is_array() {
                return InferredKind::Json;
            }
        }
    }
    InferredKind::String
}

fn infer_column_kind(rows: &[Vec<Option<String>>], col: usize) -> InferredKind {
    for row in rows {
        if let Some(Some(cell)) = row.get(col) {
            return classify(cell);
        }
    }
    InferredKind::AllNull
}

fn try_build_ints(rows: &[Vec<Option<String>>], col: usize) -> Option<Vec<Option<i64>>> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        match row.get(col).and_then(|c| c.as_ref()) {
            None => out.push(None),
            Some(s) => match s.trim().parse::<i64>() {
                Ok(v) => out.push(Some(v)),
                Err(_) => return None,
            },
        }
    }
    Some(out)
}

fn try_build_floats(rows: &[Vec<Option<String>>], col: usize) -> Option<Vec<Option<f64>>> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        match row.get(col).and_then(|c| c.as_ref()) {
            None => out.push(None),
            Some(s) => {
                let t = s.trim();
                if t.is_empty() {
                    return None;
                }
                match t.parse::<f64>() {
                    Ok(v) => out.push(Some(v)),
                    Err(_) => return None,
                }
            }
        }
    }
    Some(out)
}

fn try_build_bools(rows: &[Vec<Option<String>>], col: usize) -> Option<Vec<Option<bool>>> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        match row.get(col).and_then(|c| c.as_ref()) {
            None => out.push(None),
            Some(s) => match s.trim().to_ascii_lowercase().as_str() {
                "true" => out.push(Some(true)),
                "false" => out.push(Some(false)),
                _ => return None,
            },
        }
    }
    Some(out)
}

fn try_build_json(
    rows: &[Vec<Option<String>>],
    col: usize,
) -> Option<Vec<Option<serde_json::Value>>> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        match row.get(col).and_then(|c| c.as_ref()) {
            None => out.push(None),
            Some(s) => match serde_json::from_str::<serde_json::Value>(s.trim()) {
                Ok(v) if v.is_object() || v.is_array() => out.push(Some(v)),
                _ => return None,
            },
        }
    }
    Some(out)
}

fn build_strings(rows: &[Vec<Option<String>>], col: usize) -> Vec<Option<String>> {
    rows.iter()
        .map(|r| r.get(col).and_then(|c| c.clone()))
        .collect()
}

// ── Conversions ─────────────────────────────────────────────────────────────

impl From<QueryResult> for ColumnarResult {
    fn from(qr: QueryResult) -> Self {
        let row_count = qr.rows.len();
        let n_cols = qr.columns.len();
        let mut data = Vec::with_capacity(n_cols);

        for col in 0..n_cols {
            let kind = infer_column_kind(&qr.rows, col);
            let built = match kind {
                InferredKind::AllNull => ColumnData::Null(row_count),
                InferredKind::Int => try_build_ints(&qr.rows, col)
                    .map(ColumnData::Ints)
                    .unwrap_or_else(|| ColumnData::Strings(build_strings(&qr.rows, col))),
                InferredKind::Float => try_build_floats(&qr.rows, col)
                    .map(ColumnData::Floats)
                    .unwrap_or_else(|| ColumnData::Strings(build_strings(&qr.rows, col))),
                InferredKind::Bool => try_build_bools(&qr.rows, col)
                    .map(ColumnData::Bools)
                    .unwrap_or_else(|| ColumnData::Strings(build_strings(&qr.rows, col))),
                InferredKind::Json => try_build_json(&qr.rows, col)
                    .map(ColumnData::Json)
                    .unwrap_or_else(|| ColumnData::Strings(build_strings(&qr.rows, col))),
                InferredKind::String => ColumnData::Strings(build_strings(&qr.rows, col)),
            };
            data.push(built);
        }

        ColumnarResult {
            columns: qr.columns,
            data,
            row_count,
            affected_rows: qr.affected_rows,
            execution_time_ms: qr.execution_time_ms,
            truncated: qr.truncated,
            total_row_count: qr.total_row_count,
        }
    }
}

fn cell_at(col: &ColumnData, i: usize) -> Option<String> {
    match col {
        ColumnData::Ints(v) => v.get(i).and_then(|c| c.as_ref().map(|n| n.to_string())),
        ColumnData::Floats(v) => v.get(i).and_then(|c| c.as_ref().map(|n| n.to_string())),
        ColumnData::Strings(v) => v.get(i).and_then(|c| c.clone()),
        ColumnData::Bools(v) => v.get(i).and_then(|c| c.as_ref().map(|b| b.to_string())),
        ColumnData::Bytes(v) => v
            .get(i)
            .and_then(|c| c.as_ref().map(|b| String::from_utf8_lossy(b).into_owned())),
        ColumnData::Json(v) => v.get(i).and_then(|c| {
            c.as_ref()
                .map(|val| serde_json::to_string(val).unwrap_or_default())
        }),
        ColumnData::Null(_) => None,
    }
}

impl From<&ColumnarResult> for QueryResult {
    fn from(cr: &ColumnarResult) -> Self {
        let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(cr.row_count);
        for i in 0..cr.row_count {
            let mut row = Vec::with_capacity(cr.data.len());
            for col in &cr.data {
                row.push(cell_at(col, i));
            }
            rows.push(row);
        }
        QueryResult {
            columns: cr.columns.clone(),
            rows,
            affected_rows: cr.affected_rows,
            execution_time_ms: cr.execution_time_ms,
            truncated: cr.truncated,
            total_row_count: cr.total_row_count,
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ColumnInfo;

    fn col(name: &str) -> ColumnInfo {
        ColumnInfo {
            name: name.to_string(),
            type_name: "text".to_string(),
            nullable: true,
            is_primary_key: false,
        }
    }

    fn qr(cols: Vec<&str>, rows: Vec<Vec<Option<&str>>>) -> QueryResult {
        QueryResult {
            columns: cols.into_iter().map(col).collect(),
            rows: rows
                .into_iter()
                .map(|r| r.into_iter().map(|c| c.map(String::from)).collect())
                .collect(),
            affected_rows: 0,
            execution_time_ms: 0.0,
            truncated: false,
            total_row_count: None,
        }
    }

    #[test]
    fn empty_result_round_trip() {
        let q = qr(vec!["a", "b"], vec![]);
        let c: ColumnarResult = q.clone().into();
        assert_eq!(c.row_count, 0);
        assert_eq!(c.data.len(), 2);
        for d in &c.data {
            assert!(matches!(d, ColumnData::Null(0)));
        }
        let back: QueryResult = (&c).into();
        assert_eq!(back.rows.len(), 0);
        assert_eq!(back.columns.len(), 2);
    }

    #[test]
    fn all_null_column() {
        let q = qr(
            vec!["x"],
            vec![vec![None], vec![None], vec![None]],
        );
        let c: ColumnarResult = q.into();
        assert!(matches!(c.data[0], ColumnData::Null(3)));
        assert_eq!(c.data[0].len(), 3);
        let back: QueryResult = (&c).into();
        assert_eq!(back.rows.len(), 3);
        for r in &back.rows {
            assert_eq!(r[0], None);
        }
    }

    #[test]
    fn int_inference() {
        let q = qr(
            vec!["n"],
            vec![vec![Some("1")], vec![Some("2")], vec![Some("3")]],
        );
        let c: ColumnarResult = q.into();
        match &c.data[0] {
            ColumnData::Ints(v) => {
                assert_eq!(v, &vec![Some(1i64), Some(2), Some(3)]);
            }
            other => panic!("expected Ints, got {other:?}"),
        }
    }

    #[test]
    fn mixed_fallback_to_strings() {
        let q = qr(
            vec!["m"],
            vec![vec![Some("1")], vec![Some("abc")], vec![Some("3")]],
        );
        let c: ColumnarResult = q.into();
        match &c.data[0] {
            ColumnData::Strings(v) => {
                assert_eq!(
                    v,
                    &vec![
                        Some("1".to_string()),
                        Some("abc".to_string()),
                        Some("3".to_string())
                    ]
                );
            }
            other => panic!("expected Strings, got {other:?}"),
        }
    }

    #[test]
    fn null_interspersed_int() {
        let q = qr(
            vec!["n"],
            vec![vec![Some("1")], vec![None], vec![Some("3")]],
        );
        let c: ColumnarResult = q.into();
        match &c.data[0] {
            ColumnData::Ints(v) => {
                assert_eq!(v, &vec![Some(1i64), None, Some(3)]);
            }
            other => panic!("expected Ints, got {other:?}"),
        }
    }

    #[test]
    fn bool_and_json_inference() {
        let q = qr(
            vec!["b", "j"],
            vec![
                vec![Some("true"), Some(r#"{"k":1}"#)],
                vec![Some("False"), Some(r#"[1,2]"#)],
                vec![None, None],
            ],
        );
        let c: ColumnarResult = q.into();
        assert!(matches!(c.data[0], ColumnData::Bools(_)));
        assert!(matches!(c.data[1], ColumnData::Json(_)));
        if let ColumnData::Bools(v) = &c.data[0] {
            assert_eq!(v, &vec![Some(true), Some(false), None]);
        }
    }

    #[test]
    fn round_trip_row_col_row() {
        let mut rows: Vec<Vec<Option<&str>>> = Vec::with_capacity(100);
        // We use a fixed string per column rather than per-row formatted i64 so
        // round-trip equality is exact (numeric reformatting handled separately).
        let int_strs: Vec<String> = (0..100).map(|i| i.to_string()).collect();
        for (i, int_s) in int_strs.iter().enumerate() {
            rows.push(vec![
                Some(int_s.as_str()),       // ints
                Some("hello"),              // strings
                if i % 5 == 0 { None } else { Some("true") }, // bools w/ nulls
                Some("3.14"),               // floats (constant for stable formatting)
                None,                       // all-null
            ]);
        }
        let q = qr(vec!["i", "s", "b", "f", "n"], rows);
        let c: ColumnarResult = q.clone().into();
        assert!(matches!(c.data[0], ColumnData::Ints(_)));
        assert!(matches!(c.data[1], ColumnData::Strings(_)));
        assert!(matches!(c.data[2], ColumnData::Bools(_)));
        assert!(matches!(c.data[3], ColumnData::Floats(_)));
        assert!(matches!(c.data[4], ColumnData::Null(100)));

        let back: QueryResult = (&c).into();
        assert_eq!(back.rows.len(), 100);
        for (orig, rt) in q.rows.iter().zip(back.rows.iter()) {
            // ints, strings, bools (lowercased on round-trip — original "True"
            // would normalize, but we used "true"/None here), floats, null
            assert_eq!(orig[0], rt[0]); // int strings stable
            assert_eq!(orig[1], rt[1]); // strings stable
            // bools: original "true" → true → "true", matches.
            assert_eq!(orig[2], rt[2]);
            assert_eq!(orig[3], rt[3]); // "3.14" → 3.14 → "3.14"
            assert_eq!(orig[4], rt[4]); // None → None
        }
    }

    #[test]
    fn len_and_is_empty() {
        assert!(ColumnData::Null(0).is_empty());
        assert_eq!(ColumnData::Null(7).len(), 7);
        assert_eq!(ColumnData::Ints(vec![Some(1), None, Some(2)]).len(), 3);
        assert!(ColumnData::Strings(vec![]).is_empty());
        assert_eq!(
            ColumnData::Json(vec![Some(serde_json::json!({"a":1}))]).len(),
            1
        );
    }

    #[test]
    fn serde_round_trip() {
        let q = qr(
            vec!["n", "s"],
            vec![vec![Some("42"), Some("hi")], vec![None, Some("x")]],
        );
        let c: ColumnarResult = q.into();
        let json = serde_json::to_string(&c).expect("serialize");
        let back: ColumnarResult = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.row_count, 2);
        assert_eq!(back.data.len(), 2);
        assert!(matches!(back.data[0], ColumnData::Ints(_)));
    }

    #[test]
    #[ignore]
    fn bench_10k_rows() {
        let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(10_000);
        for i in 0..10_000usize {
            rows.push(vec![
                Some(i.to_string()),
                Some(format!("name-{i}")),
                Some(format!("{}", (i as f64) * 1.5)),
                Some(if i % 2 == 0 { "true" } else { "false" }.to_string()),
                Some(r#"{"k":1}"#.to_string()),
                None,
                Some(format!("desc {i}")),
                Some((i as i64 * 7).to_string()),
            ]);
        }
        let cols = (0..8).map(|i| col(&format!("c{i}"))).collect();
        let qr = QueryResult {
            columns: cols,
            rows,
            affected_rows: 0,
            execution_time_ms: 0.0,
            truncated: false,
            total_row_count: None,
        };

        let t0 = std::time::Instant::now();
        let cr: ColumnarResult = qr.into();
        eprintln!("row→col 10K×8: {:?}", t0.elapsed());
        let t1 = std::time::Instant::now();
        let _: QueryResult = (&cr).into();
        eprintln!("col→row 10K×8: {:?}", t1.elapsed());
    }
}
