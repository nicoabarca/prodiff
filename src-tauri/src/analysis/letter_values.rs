//! The letter-value plot (Hofmann, Wickham and Kafadar, 2017): a box plot for
//! large samples. Past the fourths it keeps halving the tail, drawing a box for
//! each eighth, sixteenth and so on, and stops while each box still rests on
//! enough cases to be trusted. Only the values past the last box are outliers.

use super::stats::quantile;

/// One letter value pair: the quantiles at `2^-depth` and `1 - 2^-depth`.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LetterBox {
    pub depth: u32,
    pub lower: f64,
    pub upper: f64,
}

/// One Group's letter-value plot. `boxes` runs from the fourths outwards, and
/// `low` and `high` are the values past the last box, both ascending.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LetterValues {
    pub median: f64,
    pub boxes: Vec<LetterBox>,
    pub low: Vec<f64>,
    pub high: Vec<f64>,
}

/// How many letter values to draw: the median plus `floor(log2 n) - 3` more,
/// so about 8 to 16 values stay past the last box. At least the fourths.
pub fn depth_count(n: usize) -> u32 {
    if n < 2 {
        return 1;
    }
    (n.ilog2().saturating_sub(3)).max(2)
}

/// The letter-value plot of an ascending slice.
pub fn letter_values(sorted: &[f64]) -> LetterValues {
    if sorted.is_empty() {
        return LetterValues {
            median: f64::NAN,
            boxes: Vec::new(),
            low: Vec::new(),
            high: Vec::new(),
        };
    }
    let boxes: Vec<LetterBox> = (2..=depth_count(sorted.len()))
        .map(|depth| {
            let tail = 0.5_f64.powi(depth as i32);
            LetterBox {
                depth,
                lower: quantile(sorted, tail),
                upper: quantile(sorted, 1.0 - tail),
            }
        })
        .collect();
    let (lower, upper) = boxes
        .last()
        .map_or((f64::NEG_INFINITY, f64::INFINITY), |last| {
            (last.lower, last.upper)
        });
    let below = sorted.iter().take_while(|v| **v < lower).count();
    let above = sorted.iter().rev().take_while(|v| **v > upper).count();
    LetterValues {
        median: quantile(sorted, 0.5),
        boxes,
        low: sorted[..below].to_vec(),
        high: sorted[sorted.len() - above..].to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depth_grows_with_log2_of_n() {
        assert_eq!(depth_count(1), 1);
        assert_eq!(depth_count(10), 2);
        assert_eq!(depth_count(100), 3);
        assert_eq!(depth_count(1_000), 6);
        assert_eq!(depth_count(88_351), 13);
    }

    #[test]
    fn the_first_box_is_the_fourths() {
        let values: Vec<f64> = (1..=100).map(f64::from).collect();
        let plot = letter_values(&values);
        assert_eq!(plot.boxes[0].depth, 2);
        assert_eq!(plot.boxes[0].lower, quantile(&values, 0.25));
        assert_eq!(plot.boxes[0].upper, quantile(&values, 0.75));
        assert_eq!(plot.median, quantile(&values, 0.5));
    }

    #[test]
    fn boxes_nest_outwards() {
        let values: Vec<f64> = (0..5_000).map(|i| (i as f64 / 500.0).exp()).collect();
        let plot = letter_values(&values);
        for pair in plot.boxes.windows(2) {
            assert!(pair[1].lower <= pair[0].lower);
            assert!(pair[1].upper >= pair[0].upper);
        }
    }

    #[test]
    fn only_a_few_values_are_left_past_the_last_box() {
        let values: Vec<f64> = (0..88_351).map(f64::from).collect();
        let plot = letter_values(&values);
        assert!(plot.low.len() <= 16 && plot.high.len() <= 16);
        assert!(!plot.low.is_empty() && !plot.high.is_empty());
    }

    #[test]
    fn an_empty_sample_has_no_boxes() {
        let plot = letter_values(&[]);
        assert!(plot.median.is_nan());
        assert!(plot.boxes.is_empty());
    }
}
