//! Numbers written with digit grouping ("1,234.56", "1.234,56", "1 234,5"),
//! which the CSV reader leaves as text.

use polars::prelude::*;

const DECIMAL_SEPARATORS: [char; 2] = ['.', ','];
const GROUP_SEPARATORS: [char; 6] = [',', '.', ' ', '\u{a0}', '\u{202f}', '\''];

/// A column of grouped numbers rewritten as plain ones ("1234.56"), ready for a
/// strict cast. One decimal separator holds for the whole column; where both
/// read every value, `.` wins, so "1,234" is 1234 and "1.234" is 1.234. Blank
/// values become null. `None` when some value is not a number under either
/// separator, or when the column holds no value at all.
pub(crate) fn ungrouped(values: &StringChunked) -> Option<StringChunked> {
    if values.iter().flatten().all(|value| value.trim().is_empty()) {
        return None;
    }
    DECIMAL_SEPARATORS.iter().find_map(|&decimal| {
        values
            .iter()
            .map(|value| match value.map(str::trim) {
                None | Some("") => Some(None),
                Some(text) => plain(text, decimal).map(Some),
            })
            .collect::<Option<Vec<Option<String>>>>()
            .map(|plain| {
                StringChunked::from_iter(plain.iter().map(Option::as_deref))
                    .with_name(values.name().clone())
            })
    })
}

/// One grouped number as a plain one: integer groups of three after a first
/// group of one to three digits, all split by one separator other than
/// `decimal`.
fn plain(text: &str, decimal: char) -> Option<String> {
    let (sign, unsigned) = match text.strip_prefix(['-', '+']) {
        Some(rest) => (&text[..1], rest),
        None => ("", text),
    };
    let (integer, fraction) = match unsigned.split_once(decimal) {
        Some((integer, fraction)) => (integer, Some(fraction)),
        None => (unsigned, None),
    };
    let digits = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    if fraction.is_some_and(|fraction| !digits(fraction)) {
        return None;
    }

    let integer = if (integer.is_empty() && fraction.is_some()) || digits(integer) {
        integer.to_string()
    } else {
        let group = integer.chars().find(|c| !c.is_ascii_digit())?;
        if group == decimal || !GROUP_SEPARATORS.contains(&group) {
            return None;
        }
        let mut groups = integer.split(group);
        let first = groups.next()?;
        if !digits(first) || first.len() > 3 {
            return None;
        }
        let mut joined = first.to_string();
        for rest in groups {
            if rest.len() != 3 || !digits(rest) {
                return None;
            }
            joined.push_str(rest);
        }
        joined
    };

    Some(match fraction {
        Some(fraction) => format!("{sign}{integer}.{fraction}"),
        None => format!("{sign}{integer}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(values: &[Option<&str>]) -> Option<Vec<Option<String>>> {
        let column = StringChunked::from_iter(values.iter().copied());
        ungrouped(&column).map(|plain| {
            plain
                .iter()
                .map(|value| value.map(str::to_string))
                .collect()
        })
    }

    fn plain_values(values: &[&str]) -> Option<Vec<String>> {
        let read = read(&values.iter().map(|v| Some(*v)).collect::<Vec<_>>())?;
        Some(read.into_iter().map(Option::unwrap).collect())
    }

    #[test]
    fn commas_group_thousands_before_a_decimal_point() {
        assert_eq!(
            plain_values(&["1,234.56", "12,345,678.9", "-3,000", "42.5"]).unwrap(),
            ["1234.56", "12345678.9", "-3000", "42.5"]
        );
    }

    #[test]
    fn points_group_thousands_before_a_decimal_comma() {
        assert_eq!(
            plain_values(&["1.234,56", "12.345.678,9", "7,25"]).unwrap(),
            ["1234.56", "12345678.9", "7.25"]
        );
    }

    #[test]
    fn spaces_and_apostrophes_group_thousands_too() {
        assert_eq!(
            plain_values(&["1 234,5", "1\u{a0}234,5", "1'234.5"]).unwrap(),
            ["1234.5", "1234.5", "1234.5"]
        );
    }

    #[test]
    fn a_value_that_only_one_separator_reads_decides_the_column() {
        assert_eq!(
            plain_values(&["1.234", "1.234,5"]).unwrap(),
            ["1234", "1234.5"]
        );
    }

    #[test]
    fn a_point_is_decimal_where_either_reading_works() {
        assert_eq!(plain_values(&["1.234", "1,234"]).unwrap(), ["1.234", "1234"]);
    }

    #[test]
    fn blank_values_are_missing() {
        assert_eq!(
            read(&[Some("1,234.5"), Some(" "), None]).unwrap(),
            [Some("1234.5".to_string()), None, None]
        );
    }

    #[test]
    fn misplaced_groups_are_not_numbers() {
        assert_eq!(plain_values(&["12,34.5"]), None);
        assert_eq!(plain_values(&["1234,567.8"]), None);
        assert_eq!(plain_values(&["1,234 567.8"]), None);
        assert_eq!(plain_values(&["1,234.5.6"]), None);
    }

    #[test]
    fn text_is_not_a_number() {
        assert_eq!(plain_values(&["1,234", "NIL"]), None);
        assert_eq!(plain_values(&["12 kg"]), None);
    }

    #[test]
    fn a_column_without_values_is_not_numeric() {
        assert_eq!(read(&[None, Some("")]), None);
    }
}
