//! The Significance Test machinery: Mann-Whitney U for numeric attributes,
//! chi-square for categorical, and the Benjamini-Hochberg correction applied
//! per attribute family.

use super::{Acc, Direction, Summary, Test};
use statrs::distribution::{ChiSquared, ContinuousCDF, Normal};
use std::collections::HashMap;

/// Linear-interpolated quantile over a sorted slice — the same convention
/// numpy and every box plot in the app use.
pub(super) fn quantile(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    let position = q * (sorted.len() - 1) as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    if lower == upper {
        return sorted[lower];
    }
    sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower as f64)
}

/// Where a box plot's whiskers reach, and how much is past them.
///
/// The whiskers are the extreme *observations* still inside 1.5·IQR of the box,
/// not the fences themselves — so a sample whose whole spread fits within the
/// fences whiskers to its own min and max, and nothing is ever drawn at a value
/// no case actually took.
pub(super) fn tukey(sorted: &[f64]) -> (f64, f64, usize, usize) {
    let (Some(&first), Some(&last)) = (sorted.first(), sorted.last()) else {
        return (f64::NAN, f64::NAN, 0, 0);
    };
    let q1 = quantile(sorted, 0.25);
    let q3 = quantile(sorted, 0.75);
    let reach = 1.5 * (q3 - q1);
    let low = sorted.iter().copied().find(|v| *v >= q1 - reach).unwrap_or(first);
    let high = sorted.iter().copied().rev().find(|v| *v <= q3 + reach).unwrap_or(last);
    (
        low,
        high,
        sorted.iter().take_while(|v| **v < low).count(),
        sorted.iter().rev().take_while(|v| **v > high).count(),
    )
}

pub(super) fn numeric_summary(values: &[f64]) -> Summary {
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = sorted.len();
    let mean = sorted.iter().sum::<f64>() / n as f64;
    // Sample standard deviation; a single observation has no spread rather
    // than a divide-by-zero one.
    let std = if n > 1 {
        (sorted.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1) as f64).sqrt()
    } else {
        0.0
    };
    let (whisker_low, whisker_high, outliers_low, outliers_high) = tukey(&sorted);
    Summary::Numerical {
        n,
        mean,
        std,
        min: sorted[0],
        q1: quantile(&sorted, 0.25),
        median: quantile(&sorted, 0.5),
        q3: quantile(&sorted, 0.75),
        max: sorted[n - 1],
        whisker_low,
        whisker_high,
        outliers_low,
        outliers_high,
    }
}

/// Midranks of the combined sample, so ties share the average rank.
fn midranks(combined: &[f64]) -> (Vec<f64>, f64) {
    let mut order: Vec<usize> = (0..combined.len()).collect();
    order.sort_by(|&a, &b| {
        combined[a]
            .partial_cmp(&combined[b])
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut ranks = vec![0.0; combined.len()];
    let mut tie_term = 0.0;
    let mut i = 0;
    while i < order.len() {
        let mut j = i;
        while j + 1 < order.len() && combined[order[j + 1]] == combined[order[i]] {
            j += 1;
        }
        let run = (j - i + 1) as f64;
        let average = (i + j + 2) as f64 / 2.0; // ranks are 1-based
        for &index in &order[i..=j] {
            ranks[index] = average;
        }
        tie_term += run.powi(3) - run;
        i = j + 1;
    }
    (ranks, tie_term)
}

/// Two-sided Mann-Whitney U. Normal approximation with tie and continuity
/// corrections — exact enough from n = 5 up, which is where the gate sits.
///
/// ponytail: no exact permutation branch for tiny samples; add one if findings
/// at n ≈ 5 ever need to be defended precisely.
fn mann_whitney(a: &[f64], b: &[f64]) -> Option<Test> {
    let (n1, n2) = (a.len() as f64, b.len() as f64);
    let combined: Vec<f64> = a.iter().chain(b).copied().collect();
    let (ranks, tie_term) = midranks(&combined);

    let rank_sum_a: f64 = ranks[..a.len()].iter().sum();
    let u = rank_sum_a - n1 * (n1 + 1.0) / 2.0;
    let product = n1 * n2;
    let mean = product / 2.0;
    let n = n1 + n2;
    let variance = product / 12.0 * ((n + 1.0) - tie_term / (n * (n - 1.0)));

    // Zero variance means every observation is identical: nothing to detect.
    let p_value = if variance <= 0.0 {
        1.0
    } else {
        let z = ((u - mean).abs() - 0.5).max(0.0) / variance.sqrt();
        let normal = Normal::new(0.0, 1.0).ok()?;
        (2.0 * (1.0 - normal.cdf(z))).clamp(0.0, 1.0)
    };

    // Rank-biserial. Positive = Group A ranks higher.
    let effect_signed = 2.0 * u / product - 1.0;
    Some(Test {
        test: "mannwhitney",
        statistic: u,
        p_value,
        effect_size: effect_signed.abs(),
        effect_signed: Some(effect_signed),
        significant: false, // set by the Benjamini-Hochberg pass
        direction: Some(if effect_signed >= 0.0 {
            Direction::AHigher
        } else {
            Direction::BHigher
        }),
    })
}

/// Chi-square over the value × group contingency table. Non-directional, so no
/// Effect Direction and no part in Attribute Co-movement.
fn chi_square(a: &HashMap<String, i64>, b: &HashMap<String, i64>) -> Option<Test> {
    let mut values: Vec<&String> = a.keys().chain(b.keys()).collect();
    values.sort();
    values.dedup();
    if values.len() < 2 {
        return None; // one category: zero degrees of freedom, nothing to test
    }

    let total_a: i64 = a.values().sum();
    let total_b: i64 = b.values().sum();
    let total = (total_a + total_b) as f64;

    let mut statistic = 0.0;
    for value in &values {
        let row =
            (a.get(*value).copied().unwrap_or(0) + b.get(*value).copied().unwrap_or(0)) as f64;
        for (observed, column_total) in [
            (a.get(*value).copied().unwrap_or(0), total_a),
            (b.get(*value).copied().unwrap_or(0), total_b),
        ] {
            let expected = row * column_total as f64 / total;
            if expected > 0.0 {
                statistic += (observed as f64 - expected).powi(2) / expected;
            }
        }
    }

    let degrees = (values.len() - 1) as f64;
    let distribution = ChiSquared::new(degrees).ok()?;
    Some(Test {
        test: "chi2",
        statistic,
        p_value: (1.0 - distribution.cdf(statistic)).clamp(0.0, 1.0),
        // Cramér's V; with two groups the denominator's min(r−1, c−1) is 1.
        effect_size: (statistic / total).sqrt(),
        effect_signed: None,
        significant: false,
        direction: None,
    })
}

pub(super) fn compare(a: &Acc, b: &Acc, numeric: bool) -> Option<Test> {
    match (a, b) {
        (Acc::Num(a), Acc::Num(b)) if numeric => mann_whitney(a, b),
        (Acc::Cat(a), Acc::Cat(b)) => chi_square(a, b),
        _ => None,
    }
}

/// Largest p-value that survives Benjamini-Hochberg at `alpha` — every test at
/// or below it is significant. Returns a value below zero when none do, so the
/// comparison at the call site needs no special case.
pub(super) fn benjamini_hochberg(p_values: &[f64], alpha: f64) -> f64 {
    let mut sorted = p_values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = sorted.len() as f64;
    sorted
        .iter()
        .enumerate()
        .rev()
        .find(|(i, p)| **p <= (*i as f64 + 1.0) / m * alpha)
        .map(|(_, p)| *p)
        .unwrap_or(-1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantiles_interpolate_like_a_box_plot() {
        let Summary::Numerical { q1, median, q3, .. } = numeric_summary(&[1.0, 2.0, 3.0, 4.0, 5.0])
        else {
            panic!("expected numeric");
        };
        assert_eq!((q1, median, q3), (2.0, 3.0, 4.0));
    }

    #[test]
    fn mann_whitney_separates_disjoint_samples() {
        let test =
            mann_whitney(&[1.0, 2.0, 3.0, 4.0, 5.0], &[10.0, 11.0, 12.0, 13.0, 14.0]).unwrap();
        // Group A ranks entirely below B: U = 0, rank-biserial = −1.
        assert_eq!(test.statistic, 0.0);
        assert_eq!(test.effect_signed, Some(-1.0));
        assert_eq!(test.direction, Some(Direction::BHigher));
        assert!(test.p_value < 0.05);
    }

    #[test]
    fn identical_samples_are_never_a_finding() {
        let test = mann_whitney(&[7.0; 6], &[7.0; 6]).unwrap();
        assert_eq!(test.p_value, 1.0);
        assert_eq!(test.effect_signed, Some(0.0));
    }

    #[test]
    fn chi_square_matches_a_hand_computed_table() {
        // 40/10 vs 10/40 over 100 observations: χ² = 36, V = 0.6.
        let a = HashMap::from([("x".to_string(), 40), ("y".to_string(), 10)]);
        let b = HashMap::from([("x".to_string(), 10), ("y".to_string(), 40)]);
        let test = chi_square(&a, &b).unwrap();
        assert!((test.statistic - 36.0).abs() < 1e-9);
        assert!((test.effect_size - 0.6).abs() < 1e-9);
        assert!(test.p_value < 1e-6);
        assert!(test.direction.is_none(), "chi² is non-directional");
    }

    #[test]
    fn a_single_category_has_nothing_to_compare() {
        let a = HashMap::from([("x".to_string(), 5)]);
        let b = HashMap::from([("x".to_string(), 9)]);
        assert!(chi_square(&a, &b).is_none());
    }

    #[test]
    fn benjamini_hochberg_is_stricter_than_the_raw_threshold() {
        // Uncorrected, 0.04 would pass; in a family of ten it does not.
        let family = [0.001, 0.04, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
        let cutoff = benjamini_hochberg(&family, 0.05);
        assert_eq!(cutoff, 0.001);
        assert!(0.04 > cutoff);
    }

    #[test]
    fn nothing_significant_gives_a_cutoff_below_every_p_value() {
        assert!(benjamini_hochberg(&[0.5, 0.6, 0.7], 0.05) < 0.0);
    }
}
