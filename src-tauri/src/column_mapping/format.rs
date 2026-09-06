//! Translation of a declared timestamp format into a Polars format string.
//!
//! The Column Mapping carries the pattern in the user's vocabulary
//! (`DD/MM/YYYY HH:mm`) rather than in Polars' (`%d/%m/%Y %H:%M`), because that
//! is the string the user confirmed and the string an import error has to quote
//! back at them. Translation happens here, at the point of use, so the stored
//! mapping never holds a backend detail.
//!
//! The token table mirrors `FORMAT_TOKENS` in `src/lib/timestamp-format.ts`,
//! which the frontend needs for its own parser. Both are static and small; each
//! side is tested against the same catalog patterns.

/// Longest token first — matching is greedy, so `YYYY` has to be tried before
/// `YY`, or the pattern splits into two `YY` and quietly means a different year.
const TOKENS: &[(&str, &str)] = &[
    ("YYYY", "%Y"),
    // `%6f` and `%3f` are six and three fractional digits carrying no separator
    // of their own. chrono's `%.3f` swallows a leading dot, which would double
    // the one the pattern already spells out in `ss.SSS`.
    ("SSSSSS", "%6f"),
    ("SSS", "%3f"),
    ("YY", "%y"),
    ("MM", "%m"),
    ("DD", "%d"),
    ("HH", "%H"),
    ("hh", "%I"),
    ("mm", "%M"),
    ("ss", "%S"),
    ("M", "%-m"),
    ("D", "%-d"),
    ("H", "%-H"),
    ("h", "%-I"),
    ("A", "%p"),
    ("Z", "%z"),
];

/// Rewrites a user-facing pattern as a Polars/chrono format string. Anything
/// that is not a token is a literal and passes through untouched; a literal `%`
/// is written `%%` in the pattern and escapes to `%%` for chrono.
pub fn to_polars_format(pattern: &str) -> String {
    let bytes = pattern.as_bytes();
    let mut out = String::with_capacity(pattern.len() + 4);
    let mut i = 0;

    while i < bytes.len() {
        if pattern[i..].starts_with("%%") {
            out.push_str("%%");
            i += 2;
            continue;
        }
        match TOKENS
            .iter()
            .find(|(token, _)| pattern[i..].starts_with(token))
        {
            Some((token, directive)) => {
                out.push_str(directive);
                i += token.len();
            }
            None => {
                // Step by character, not by byte: a literal can be multi-byte
                // and slicing mid-character would panic.
                let ch = pattern[i..].chars().next().expect("index is on a boundary");
                if ch == '%' {
                    out.push_str("%%");
                } else {
                    out.push(ch);
                }
                i += ch.len_utf8();
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The catalog is what the format select offers, so every entry in it has
    /// to survive translation — a pattern the user can pick but Polars cannot
    /// read would fail at import with nothing having warned them.
    #[test]
    fn every_catalog_pattern_translates() {
        let cases = [
            ("YYYY-MM-DD HH:mm:ss", "%Y-%m-%d %H:%M:%S"),
            ("YYYY-MM-DDTHH:mm:ss", "%Y-%m-%dT%H:%M:%S"),
            ("YYYY-MM-DD HH:mm:ss.SSS", "%Y-%m-%d %H:%M:%S.%3f"),
            ("YYYY-MM-DD HH:mm:ss.SSSSSS", "%Y-%m-%d %H:%M:%S.%6f"),
            ("YYYY-MM-DD HH:mm:ss.SSSSSSZ", "%Y-%m-%d %H:%M:%S.%6f%z"),
            ("YYYY-MM-DDTHH:mm:ss.SSSSSSZ", "%Y-%m-%dT%H:%M:%S.%6f%z"),
            ("YYYY-MM-DDTHH:mm:ssZ", "%Y-%m-%dT%H:%M:%S%z"),
            ("YYYY-MM-DD", "%Y-%m-%d"),
            ("DD/MM/YYYY HH:mm:ss", "%d/%m/%Y %H:%M:%S"),
            ("DD/MM/YYYY HH:mm", "%d/%m/%Y %H:%M"),
            ("DD/MM/YYYY", "%d/%m/%Y"),
            ("DD-MM-YYYY HH:mm:ss", "%d-%m-%Y %H:%M:%S"),
            ("MM/DD/YYYY HH:mm:ss", "%m/%d/%Y %H:%M:%S"),
            ("MM/DD/YYYY", "%m/%d/%Y"),
            ("DD.MM.YYYY HH:mm:ss", "%d.%m.%Y %H:%M:%S"),
            ("YYYY/MM/DD HH:mm:ss", "%Y/%m/%d %H:%M:%S"),
            ("DD/MM/YYYY hh:mm:ss A", "%d/%m/%Y %I:%M:%S %p"),
            ("MM/DD/YYYY hh:mm:ss A", "%m/%d/%Y %I:%M:%S %p"),
        ];
        for (pattern, expected) in cases {
            assert_eq!(to_polars_format(pattern), expected, "pattern {pattern}");
        }
    }

    #[test]
    fn the_longest_token_wins_so_a_year_does_not_split_in_two() {
        assert_eq!(to_polars_format("YYYY"), "%Y");
        assert_eq!(to_polars_format("YY"), "%y");
        assert_eq!(to_polars_format("SSS"), "%3f");
        assert_eq!(to_polars_format("SSSSSS"), "%6f");
    }

    #[test]
    fn single_letter_tokens_mean_no_zero_padding() {
        assert_eq!(to_polars_format("D/M/YYYY H:mm"), "%-d/%-m/%Y %-H:%M");
    }

    #[test]
    fn anything_that_is_not_a_token_passes_through_as_a_literal() {
        assert_eq!(to_polars_format("YYYY at HH"), "%Y at %H");
    }

    #[test]
    fn a_literal_percent_is_escaped_rather_than_read_as_a_directive() {
        assert_eq!(to_polars_format("%%YYYY"), "%%%Y");
        assert_eq!(to_polars_format("%"), "%%");
    }
}

