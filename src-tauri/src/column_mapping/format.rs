//! User-facing timestamp pattern translation for Polars.

// Longest first because matching is greedy.
const TOKENS: &[(&str, &str)] = &[
    ("YYYY", "%Y"),
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
                // Step by character because literals can be multi-byte.
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
