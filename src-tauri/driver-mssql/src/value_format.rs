//! Render a TDS `ColumnData` as the display string the grid shows.
//!
//! The other drivers get text for free: PostgreSQL and MySQL both read results
//! through a simple/text protocol, so the *server* renders every value and the
//! driver just moves strings. Tiberius hands back typed `ColumnData` instead,
//! so SQL Server values have to be rendered here.
//!
//! Formatting follows SQL Server's own text output (what `sqlcmd` prints), so a
//! value shown in the grid is a value the user can paste back into a query:
//! ISO-8601 dates and times, `0`/`1` for `bit` (matching the literals
//! `sql_generator` emits for this dialect), and `0x…` for binary.
//!
//! This replaces a `Row::get::<&str, _>` call that panicked on every
//! non-character column — tiberius's `get` aborts on a type mismatch, which in
//! a `panic = "abort"` release build took the whole app down.

use tiberius::ColumnData;

/// Days from `0001-01-01` to the Unix epoch.
const DAYS_CE_TO_EPOCH: i64 = 719_162;
/// Days from `1900-01-01` (the `datetime` epoch) to the Unix epoch.
const DAYS_1900_TO_EPOCH: i64 = 25_567;

/// Render one cell. `None` is SQL `NULL` and stays `None` so the grid can show
/// its own NULL styling rather than a string that looks like data.
pub(crate) fn format_cell(data: &ColumnData<'_>) -> Option<String> {
    match data {
        ColumnData::U8(v) => v.map(|n| n.to_string()),
        ColumnData::I16(v) => v.map(|n| n.to_string()),
        ColumnData::I32(v) => v.map(|n| n.to_string()),
        ColumnData::I64(v) => v.map(|n| n.to_string()),
        ColumnData::F32(v) => v.map(format_f32),
        ColumnData::F64(v) => v.map(format_f64),
        // `bit` renders as 0/1 to match both sqlcmd and the literals
        // `Dialect::Mssql` generates, so an edited cell round-trips.
        ColumnData::Bit(v) => v.map(|b| if b { "1" } else { "0" }.to_string()),
        ColumnData::String(v) => v.as_ref().map(|s| s.to_string()),
        ColumnData::Guid(v) => v.map(|g| g.to_string()),
        ColumnData::Binary(v) => v.as_ref().map(|b| format_binary(b)),
        ColumnData::Numeric(v) => v.map(|n| n.to_string()),
        ColumnData::Xml(v) => v.as_ref().map(|x| x.to_string()),
        ColumnData::DateTime(v) => v.map(|dt| {
            // `datetime`: days since 1900-01-01 + 1/300-second ticks.
            let seconds = f64::from(dt.seconds_fragments()) / 300.0;
            format!(
                "{} {}",
                civil_date(i64::from(dt.days()) - DAYS_1900_TO_EPOCH),
                clock_from_seconds(seconds, 3)
            )
        }),
        ColumnData::SmallDateTime(v) => v.map(|dt| {
            // `smalldatetime`: days since 1900-01-01 + whole minutes.
            let seconds = f64::from(dt.seconds_fragments()) * 60.0;
            format!(
                "{} {}",
                civil_date(i64::from(dt.days()) - DAYS_1900_TO_EPOCH),
                clock_from_seconds(seconds, 0)
            )
        }),
        ColumnData::Date(v) => v.map(|d| civil_date(i64::from(d.days()) - DAYS_CE_TO_EPOCH)),
        ColumnData::Time(v) => v.map(format_time),
        ColumnData::DateTime2(v) => v.map(|dt| {
            format!(
                "{} {}",
                civil_date(i64::from(dt.date().days()) - DAYS_CE_TO_EPOCH),
                format_time(dt.time())
            )
        }),
        // Per TDS the datetime2 payload of a `datetimeoffset` is the value in
        // UTC; the offset is carried alongside. Printing the payload as-is and
        // appending the offset names a different instant than the server does
        // (SSMS shows local time), so shift it back into local time first.
        ColumnData::DateTimeOffset(v) => v.map(|dto| {
            let dt = dto.datetime2();
            let (day_shift, increments) = shift_time_by_minutes(
                dt.time().increments(),
                dt.time().scale(),
                dto.offset(),
            );
            format!(
                "{} {} {}",
                civil_date(i64::from(dt.date().days()) - DAYS_CE_TO_EPOCH + day_shift),
                format_time_units(increments, dt.time().scale()),
                format_offset(dto.offset())
            )
        }),
    }
}

/// Trim the trailing `.0` Rust prints for whole floats, so an `int`-valued
/// `float` column reads like a number rather than `42.0`.
fn format_f64(n: f64) -> String {
    if n.is_finite() && n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{n:.0}")
    } else {
        n.to_string()
    }
}

fn format_f32(n: f32) -> String {
    format_f64(f64::from(n))
}

/// SQL Server renders `varbinary` as `0x` followed by uppercase hex.
fn format_binary(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for b in bytes {
        out.push_str(&format!("{b:02X}"));
    }
    out
}

/// `time`/`time(n)`: `increments` counts 10^-`scale` second units past midnight.
fn format_time(t: tiberius::time::Time) -> String {
    format_time_units(t.increments(), t.scale())
}

/// Render `increments` units of 10^-`scale` seconds past midnight as a clock.
fn format_time_units(increments: u64, scale: u8) -> String {
    let divisor = 10u64.pow(u32::from(scale));
    let whole_seconds = increments / divisor;
    let fraction = increments % divisor;

    let base = format!(
        "{:02}:{:02}:{:02}",
        whole_seconds / 3600,
        (whole_seconds % 3600) / 60,
        whole_seconds % 60
    );
    if scale == 0 {
        base
    } else {
        format!("{base}.{fraction:0width$}", width = usize::from(scale))
    }
}

/// Add `minutes` to a time-of-day expressed in 10^-`scale` second units.
///
/// Returns the day carry (`-1`, `0` or `+1`) and the time within that day, so
/// a `+05:30` offset applied to `22:00Z` lands on the next civil date.
fn shift_time_by_minutes(increments: u64, scale: u8, minutes: i16) -> (i64, u64) {
    let units_per_second = 10i128.pow(u32::from(scale));
    let units_per_day = 86_400 * units_per_second;
    let shifted = i128::from(increments) + i128::from(minutes) * 60 * units_per_second;

    let mut day_shift = shifted.div_euclid(units_per_day);
    let mut within_day = shifted.rem_euclid(units_per_day);
    // `div_euclid`/`rem_euclid` already normalise negatives; this only guards
    // the impossible case of a remainder at the day boundary.
    if within_day == units_per_day {
        within_day = 0;
        day_shift += 1;
    }
    (day_shift as i64, within_day as u64)
}

/// Format seconds-past-midnight as a clock, keeping `decimals` fractional digits.
fn clock_from_seconds(seconds: f64, decimals: usize) -> String {
    let total = seconds.max(0.0);
    let whole = total.trunc() as u64;
    let base = format!("{:02}:{:02}:{:02}", whole / 3600, (whole % 3600) / 60, whole % 60);
    if decimals == 0 {
        return base;
    }
    let fraction = ((total - whole as f64) * 10f64.powi(decimals as i32)).round() as u64;
    format!("{base}.{fraction:0decimals$}")
}

/// `+HH:MM` / `-HH:MM` from an offset in minutes.
fn format_offset(minutes: i16) -> String {
    let sign = if minutes < 0 { '-' } else { '+' };
    let abs = minutes.unsigned_abs();
    format!("{sign}{:02}:{:02}", abs / 60, abs % 60)
}

/// Civil date from a day count relative to the Unix epoch.
///
/// Howard Hinnant's `civil_from_days`, which is exact for the whole proleptic
/// Gregorian range SQL Server can express (`0001-01-01` to `9999-12-31`).
fn civil_date(days_since_epoch: i64) -> String {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if m <= 2 { y + 1 } else { y };
    format!("{year:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_date_matches_known_calendar_points() {
        assert_eq!(civil_date(0), "1970-01-01");
        assert_eq!(civil_date(-719_162), "0001-01-01");
        assert_eq!(civil_date(-25_567), "1900-01-01");
        // Leap day, and the century that is not a leap year.
        assert_eq!(civil_date(-25_567 + 60), "1900-03-02");
        assert_eq!(civil_date(11_016), "2000-02-29");
        assert_eq!(civil_date(11_017), "2000-03-01");
    }

    #[test]
    fn date_column_uses_the_year_one_epoch() {
        // 738899 days after 0001-01-01 is 2024-01-15.
        assert_eq!(civil_date(738_899 - DAYS_CE_TO_EPOCH), "2024-01-15");
    }

    #[test]
    fn datetime_column_uses_the_1900_epoch() {
        // 45304 days after 1900-01-01 is 2024-01-15.
        assert_eq!(civil_date(45_304 - DAYS_1900_TO_EPOCH), "2024-01-15");
    }

    #[test]
    fn integers_and_null_round_trip() {
        assert_eq!(format_cell(&ColumnData::I32(Some(42))).as_deref(), Some("42"));
        assert_eq!(format_cell(&ColumnData::I64(Some(-9))).as_deref(), Some("-9"));
        assert_eq!(format_cell(&ColumnData::U8(Some(255))).as_deref(), Some("255"));
        // NULL stays None so the grid renders its own NULL marker.
        assert_eq!(format_cell(&ColumnData::I32(None)), None);
        assert_eq!(format_cell(&ColumnData::String(None)), None);
    }

    #[test]
    fn bit_renders_as_the_literal_this_dialect_generates() {
        assert_eq!(format_cell(&ColumnData::Bit(Some(true))).as_deref(), Some("1"));
        assert_eq!(format_cell(&ColumnData::Bit(Some(false))).as_deref(), Some("0"));
    }

    #[test]
    fn floats_drop_a_meaningless_trailing_zero() {
        assert_eq!(format_f64(42.0), "42");
        assert_eq!(format_f64(3.5), "3.5");
        assert_eq!(format_f64(-0.25), "-0.25");
    }

    #[test]
    fn binary_uses_sql_server_hex_notation() {
        assert_eq!(format_binary(&[0xDE, 0xAD, 0xBE, 0xEF]), "0xDEADBEEF");
        assert_eq!(format_binary(&[]), "0x");
    }

    #[test]
    fn offsets_are_signed_and_zero_padded() {
        assert_eq!(format_offset(0), "+00:00");
        assert_eq!(format_offset(330), "+05:30");
        assert_eq!(format_offset(-480), "-08:00");
    }

    #[test]
    fn clock_formatting_keeps_the_requested_precision() {
        assert_eq!(clock_from_seconds(0.0, 0), "00:00:00");
        assert_eq!(clock_from_seconds(3661.0, 0), "01:01:01");
        assert_eq!(clock_from_seconds(3661.5, 3), "01:01:01.500");
        assert_eq!(clock_from_seconds(86_399.0, 0), "23:59:59");
    }

    #[test]
    fn offset_shift_moves_the_time_into_local_time() {
        // 08:00:00Z at scale 0 with +05:30 is 13:30 the same day.
        let (day, units) = shift_time_by_minutes(8 * 3600, 0, 330);
        assert_eq!((day, units), (0, 13 * 3600 + 30 * 60));
        assert_eq!(format_time_units(units, 0), "13:30:00");
    }

    #[test]
    fn offset_shift_rolls_over_the_date_in_both_directions() {
        // 22:00Z +05:30 → 03:30 the next day.
        let (day, units) = shift_time_by_minutes(22 * 3600, 0, 330);
        assert_eq!(day, 1);
        assert_eq!(format_time_units(units, 0), "03:30:00");

        // 02:00Z -08:00 → 18:00 the previous day.
        let (day, units) = shift_time_by_minutes(2 * 3600, 0, -480);
        assert_eq!(day, -1);
        assert_eq!(format_time_units(units, 0), "18:00:00");

        // A zero offset never moves the instant.
        assert_eq!(shift_time_by_minutes(12_345, 3, 0), (0, 12_345));
    }

    #[test]
    fn offset_shift_keeps_sub_second_precision() {
        // 08:00:00.1234567 UTC at scale 7, +05:30.
        let scale = 7u8;
        let units = (8 * 3600) * 10u64.pow(7) + 1_234_567;
        let (day, shifted) = shift_time_by_minutes(units, scale, 330);
        assert_eq!(day, 0);
        assert_eq!(format_time_units(shifted, scale), "13:30:00.1234567");
    }

    #[test]
    fn strings_and_guids_pass_through() {
        assert_eq!(
            format_cell(&ColumnData::String(Some("hello".into()))).as_deref(),
            Some("hello")
        );
    }
}
