// Minimal UTC calendar math for formatting Polars millisecond timestamps as
// ISO 8601 strings, without pulling in chrono for one field.

pub(crate) fn millis_to_iso(millis: i64) -> String {
    let secs = millis.div_euclid(1000);
    let (y, m, d) = civil_from_days(secs.div_euclid(86400));
    let day_secs = secs.rem_euclid(86400);
    let hh = day_secs / 3600;
    let mm = (day_secs % 3600) / 60;
    let ss = day_secs % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

// Howard Hinnant's civil_from_days algorithm (days since epoch -> y/m/d).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// A Polars Datetime column in milliseconds, for test fixtures.
#[cfg(test)]
pub(crate) fn datetime_column(name: &str, millis: Vec<i64>) -> polars::prelude::Column {
    use polars::prelude::*;
    Column::new(name.into(), millis)
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .unwrap()
}
