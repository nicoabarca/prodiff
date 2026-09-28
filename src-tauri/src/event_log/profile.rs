//! What a stored column holds, as the Event Log page lists it: a few of its
//! values and how many events carry one.

use polars::prelude::*;

/// How many distinct values `sample` holds at most.
const SAMPLE_VALUES: usize = 4;

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ColumnProfile {
    pub name: String,
    pub sample: Vec<String>,
    pub filled: f64,
}

/// One profile per named column, in the order asked. A name the log does not
/// hold is skipped. `filled` is the share of events with a value, 0 to 1.
pub fn profiles(df: &DataFrame, names: &[String]) -> Result<Vec<ColumnProfile>, String> {
    let height = df.height();
    names
        .iter()
        .filter(|name| df.column(name).is_ok())
        .map(|name| {
            let series = df
                .column(name)
                .map_err(|e| e.to_string())?
                .cast(&DataType::String)
                .map_err(|e| e.to_string())?;
            let values = series.str().map_err(|e| e.to_string())?;
            let mut sample: Vec<String> = Vec::new();
            for value in values.iter().flatten() {
                if sample.len() == SAMPLE_VALUES {
                    break;
                }
                if !sample.iter().any(|seen| seen == value) {
                    sample.push(value.to_string());
                }
            }
            let filled = if height == 0 {
                0.0
            } else {
                (height - values.null_count()) as f64 / height as f64
            };
            Ok(ColumnProfile {
                name: name.clone(),
                sample,
                filled,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_distinct_values_and_measures_fill() {
        let df = DataFrame::new(
            4,
            vec![Column::new(
                "brand".into(),
                [Some("a"), None, Some("a"), Some("b")],
            )],
        )
        .unwrap();
        let result = profiles(&df, &["brand".to_string(), "missing".to_string()]).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].sample, vec!["a", "b"]);
        assert!((result[0].filled - 0.75).abs() < 1e-9);
    }
}
