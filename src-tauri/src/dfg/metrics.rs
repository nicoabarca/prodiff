//! The three Fuzzy Miner metrics, computed over the union of the Groups so both
//! sides see one graph and the comparison means something.
//!
//! Every metric is a scalar in `[0, 1]`. The frontend resolves conflicts and
//! applies the cutoffs; nothing here removes anything.

/// Significance: how much of the log an element accounts for, against the
/// busiest element of its own kind. Serves both the unary metric over nodes and
/// the binary one over edges.
pub(super) fn significance(events: &[i64]) -> Vec<f64> {
    let max = events.iter().copied().max().unwrap_or(0) as f64;
    if max <= 0.0 {
        return vec![0.0; events.len()];
    }
    events.iter().map(|&e| e as f64 / max).collect()
}

/// Proximity correlation: the shorter the wait between two activities, the more
/// related they are. Log scale because waiting times are heavy-tailed, then
/// min-max over the edges that have one.
///
/// An edge with no waiting time to speak of, which is every Start and End edge,
/// scores 1.0 and is never the one a cutoff drops.
pub(super) fn proximity(mean_waits: &[Option<f64>]) -> Vec<f64> {
    let logs: Vec<Option<f64>> = mean_waits
        .iter()
        .map(|wait| wait.map(|ms| (1.0 + ms.max(0.0)).ln()))
        .collect();

    let known = || logs.iter().flatten().copied();
    let low = known().fold(f64::INFINITY, f64::min);
    let high = known().fold(f64::NEG_INFINITY, f64::max);
    let span = high - low;

    logs.iter()
        .map(|value| match value {
            // Every known wait is the same length, so none is closer than another.
            Some(_) if span <= 0.0 => 1.0,
            Some(value) => 1.0 - (value - low) / span,
            None => 1.0,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn significance_is_a_share_of_the_busiest_element() {
        assert_eq!(significance(&[10, 5, 0]), vec![1.0, 0.5, 0.0]);
    }

    #[test]
    fn an_empty_graph_has_nothing_to_normalize_against() {
        assert_eq!(significance(&[0, 0]), vec![0.0, 0.0]);
    }

    #[test]
    fn the_shortest_wait_correlates_most() {
        let scores = proximity(&[Some(0.0), Some(1_000_000.0), None]);
        assert_eq!(scores[0], 1.0);
        assert_eq!(scores[1], 0.0);
        assert_eq!(scores[2], 1.0);
    }

    #[test]
    fn a_single_wait_leaves_nothing_to_rank_it_against() {
        assert_eq!(proximity(&[Some(5_000.0), None]), vec![1.0, 1.0]);
    }

    #[test]
    fn the_log_scale_keeps_the_tail_from_flattening_everything() {
        // A one-second wait against a tail of a thousand seconds. On a linear
        // scale it would score 0.999 and rank alongside no wait at all.
        let scores = proximity(&[Some(0.0), Some(1_000.0), Some(1_000_000.0)]);
        assert!((0.45..0.55).contains(&scores[1]));
    }
}
