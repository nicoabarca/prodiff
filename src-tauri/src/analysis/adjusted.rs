//! The adjusted box plot (Hubert and Vandervieren, 2008): Tukey's whiskers
//! moved by the medcouple, a robust measure of skew from -1 to 1, so a long
//! tail is not read as a run of outliers.
//!
//! The medcouple is computed with the O(n log n) algorithm of Johnson and
//! Mizera, the one R's `robustbase::mc` uses. The naive form compares every
//! pair of values, which is billions of pairs at the case counts the app sees.

use super::stats::{quantile, FLAT_WHISKERS};

/// One Group's box under the adjusted rule. `low` and `high` are the values
/// past the whiskers, both ascending.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdjustedBox {
    pub medcouple: f64,
    pub whisker_low: f64,
    pub whisker_high: f64,
    pub low: Vec<f64>,
    pub high: Vec<f64>,
}

/// The adjusted box of an ascending slice. Whiskers snap to observations, and
/// a zero IQR falls back to the same percentiles `tukey` uses.
pub fn adjusted_box(sorted: &[f64]) -> AdjustedBox {
    let (Some(&first), Some(&last)) = (sorted.first(), sorted.last()) else {
        return AdjustedBox {
            medcouple: f64::NAN,
            whisker_low: f64::NAN,
            whisker_high: f64::NAN,
            low: Vec::new(),
            high: Vec::new(),
        };
    };
    let mc = medcouple(sorted);
    let q1 = quantile(sorted, 0.25);
    let q3 = quantile(sorted, 0.75);
    let (lower, upper) = if q3 > q1 {
        let iqr = q3 - q1;
        let (down, up) = if mc >= 0.0 {
            ((-4.0 * mc).exp(), (3.0 * mc).exp())
        } else {
            ((-3.0 * mc).exp(), (4.0 * mc).exp())
        };
        (q1 - 1.5 * down * iqr, q3 + 1.5 * up * iqr)
    } else {
        (
            quantile(sorted, FLAT_WHISKERS.0),
            quantile(sorted, FLAT_WHISKERS.1),
        )
    };
    let whisker_low = sorted
        .iter()
        .copied()
        .find(|v| *v >= lower)
        .unwrap_or(first);
    let whisker_high = sorted
        .iter()
        .copied()
        .rev()
        .find(|v| *v <= upper)
        .unwrap_or(last);
    let below = sorted.iter().take_while(|v| **v < whisker_low).count();
    let above = sorted
        .iter()
        .rev()
        .take_while(|v| **v > whisker_high)
        .count();
    AdjustedBox {
        medcouple: mc,
        whisker_low,
        whisker_high,
        low: sorted[..below].to_vec(),
        high: sorted[sorted.len() - above..].to_vec(),
    }
}

/// The medcouple of an ascending slice: the median of the kernel
/// `h(xi, xj) = ((xi - m) + (xj - m)) / (xi - xj)` over every `xi >= m >= xj`,
/// with `m` the median. Pairs that both equal `m` take -1, 0 or 1 by position.
pub fn medcouple(sorted: &[f64]) -> f64 {
    let Some(kernel) = Kernel::new(sorted) else {
        return 0.0;
    };
    let total = kernel.p * kernel.q;
    // An even count has two middle kernel values, and the median is their mean.
    let low = kth(&kernel, (total - 1) / 2);
    if total % 2 == 1 {
        low
    } else {
        (low + kth(&kernel, total / 2)) / 2.0
    }
}

/// The kernel as a `p` by `q` matrix whose rows and columns both decrease.
struct Kernel {
    plus: Vec<f64>,
    minus: Vec<f64>,
    p: usize,
    q: usize,
}

impl Kernel {
    fn new(sorted: &[f64]) -> Option<Self> {
        if sorted.is_empty() {
            return None;
        }
        let median = quantile(sorted, 0.5);
        let scale = 2.0 * sorted[0].abs().max(sorted[sorted.len() - 1].abs());
        let scale = if scale > 0.0 { scale } else { 1.0 };
        let centred = |x: &f64| (x - median) / scale;
        let plus: Vec<f64> = sorted
            .iter()
            .rev()
            .filter(|x| **x >= median)
            .map(centred)
            .collect();
        let minus: Vec<f64> = sorted
            .iter()
            .rev()
            .filter(|x| **x <= median)
            .map(centred)
            .collect();
        let (p, q) = (plus.len(), minus.len());
        (p > 0 && q > 0).then_some(Self { plus, minus, p, q })
    }

    fn h(&self, i: usize, j: usize) -> f64 {
        let (a, b) = (self.plus[i], self.minus[j]);
        if a == b {
            let side = self.p as i64 - 1 - i as i64 - j as i64;
            side.signum() as f64
        } else {
            (a + b) / (a - b)
        }
    }

    /// Per row, the last column whose value is above `u`, minus one when none is.
    fn greater(&self, u: f64) -> Vec<i64> {
        let mut out = vec![0; self.p];
        let mut j = 0;
        for i in (0..self.p).rev() {
            while j < self.q && self.h(i, j) > u {
                j += 1;
            }
            out[i] = j as i64 - 1;
        }
        out
    }

    /// Per row, the first column whose value is not below `u`.
    fn less(&self, u: f64) -> Vec<i64> {
        let mut out = vec![0; self.p];
        let mut j = self.q as i64 - 1;
        for (i, slot) in out.iter_mut().enumerate() {
            while j >= 0 && self.h(i, j as usize) < u {
                j -= 1;
            }
            *slot = j + 1;
        }
        out
    }
}

/// The `k`th largest kernel value, counting from 0. Each round splits the
/// columns still in play at a weighted median of the row medians, which keeps
/// at least a quarter of them out of the next round.
fn kth(kernel: &Kernel, k: usize) -> f64 {
    let (p, q) = (kernel.p, kernel.q);
    let k = k as i64;
    let mut left = vec![0_i64; p];
    let mut right = vec![q as i64 - 1; p];
    let mut left_total: i64 = 0;
    let mut right_total = (p * q) as i64;

    while right_total - left_total > p as i64 {
        let mut candidates: Vec<(f64, i64)> = (0..p)
            .filter(|&i| left[i] <= right[i])
            .map(|i| {
                let middle = (left[i] + right[i]) / 2;
                (kernel.h(i, middle as usize), right[i] - left[i] + 1)
            })
            .collect();
        let pivot = weighted_median(&mut candidates);

        let above = kernel.greater(pivot);
        let not_below = kernel.less(pivot);
        let above_total: i64 = above.iter().sum::<i64>() + p as i64;
        let not_below_total: i64 = not_below.iter().sum();

        if k < above_total {
            right = above;
            right_total = above_total;
        } else if k >= not_below_total {
            left = not_below;
            left_total = not_below_total;
        } else {
            return pivot;
        }
    }

    let mut rest: Vec<f64> = (0..p)
        .flat_map(|i| (left[i]..=right[i]).map(move |j| (i, j as usize)))
        .map(|(i, j)| kernel.h(i, j))
        .collect();
    let at = (k - left_total) as usize;
    rest.select_nth_unstable_by(at, |a, b| {
        b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal)
    });
    rest[at]
}

/// The value at which the running weight first reaches half the total.
fn weighted_median(pairs: &mut [(f64, i64)]) -> f64 {
    pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let total: i64 = pairs.iter().map(|(_, w)| w).sum();
    let mut running = 0;
    for (value, weight) in pairs.iter() {
        running += weight;
        if 2 * running >= total {
            return *value;
        }
    }
    pairs.last().map_or(0.0, |(value, _)| *value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::stats::sort;

    /// Every pair, the definition itself.
    fn naive(sorted: &[f64]) -> f64 {
        let Some(kernel) = Kernel::new(sorted) else {
            return 0.0;
        };
        let mut all: Vec<f64> = (0..kernel.p)
            .flat_map(|i| (0..kernel.q).map(move |j| (i, j)))
            .map(|(i, j)| kernel.h(i, j))
            .collect();
        sort(&mut all);
        quantile(&all, 0.5)
    }

    fn lcg(seed: u64) -> impl FnMut() -> f64 {
        let mut state = seed;
        move || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 11) as f64 / (1u64 << 53) as f64
        }
    }

    #[test]
    fn matches_the_definition_on_random_samples() {
        let mut next = lcg(7);
        for n in [1, 2, 3, 4, 5, 10, 31, 64, 200, 501] {
            let mut values: Vec<f64> = (0..n).map(|_| (next() * 10.0).exp()).collect();
            sort(&mut values);
            let (fast, slow) = (medcouple(&values), naive(&values));
            assert!((fast - slow).abs() < 1e-12, "n={n}: {fast} vs {slow}");
        }
    }

    #[test]
    fn matches_the_definition_with_heavy_ties() {
        let mut next = lcg(11);
        for n in [6, 9, 40, 300] {
            let mut values: Vec<f64> = (0..n).map(|_| (next() * 6.0).floor()).collect();
            sort(&mut values);
            let (fast, slow) = (medcouple(&values), naive(&values));
            assert!((fast - slow).abs() < 1e-12, "n={n}: {fast} vs {slow}");
        }
    }

    #[test]
    fn is_zero_for_a_symmetric_sample() {
        assert_eq!(medcouple(&[1.0, 2.0, 3.0, 4.0, 5.0]), 0.0);
    }

    #[test]
    fn is_positive_for_a_right_tail() {
        assert!(medcouple(&[1.0, 2.0, 3.0, 4.0, 50.0, 100.0]) > 0.0);
    }

    #[test]
    fn a_right_skew_widens_the_upper_whisker() {
        let mut next = lcg(3);
        let mut values: Vec<f64> = (0..2000).map(|_| (next() * 4.0).exp()).collect();
        sort(&mut values);
        let adjusted = adjusted_box(&values);
        let (_, tukey_high, _, tukey_above) = crate::analysis::stats::tukey(&values);
        assert!(adjusted.medcouple > 0.0);
        assert!(adjusted.whisker_high >= tukey_high);
        assert!(adjusted.high.len() <= tukey_above);
    }

    #[test]
    fn an_empty_sample_has_no_box() {
        let adjusted = adjusted_box(&[]);
        assert!(adjusted.whisker_low.is_nan());
        assert!(adjusted.low.is_empty() && adjusted.high.is_empty());
    }
}
