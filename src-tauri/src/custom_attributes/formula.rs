//! A Custom Attribute's formula as the frontend parsed it. Rust never reads
//! formula text: it receives this tree, checks the columns it names and folds
//! it into a Polars expression.

use crate::column_mapping::{ColumnMapping, ColumnRole};
use polars::prelude::*;
use serde::Deserialize;
use std::collections::BTreeSet;

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Formula {
    Column {
        name: String,
    },
    Number {
        value: f64,
    },
    Negate {
        operand: Box<Formula>,
    },
    Binary {
        op: Operator,
        left: Box<Formula>,
        right: Box<Formula>,
    },
}

#[derive(Deserialize, Debug, Clone, Copy)]
pub enum Operator {
    #[serde(rename = "+")]
    Add,
    #[serde(rename = "-")]
    Subtract,
    #[serde(rename = "*")]
    Multiply,
    #[serde(rename = "/")]
    Divide,
}

impl Formula {
    /// Every column the formula reads, each once.
    pub fn columns(&self) -> BTreeSet<&str> {
        let mut names = BTreeSet::new();
        self.collect_columns(&mut names);
        names
    }

    fn collect_columns<'a>(&'a self, names: &mut BTreeSet<&'a str>) {
        match self {
            Formula::Column { name } => {
                names.insert(name);
            }
            Formula::Number { .. } => {}
            Formula::Negate { operand } => operand.collect_columns(names),
            Formula::Binary { left, right, .. } => {
                left.collect_columns(names);
                right.collect_columns(names);
            }
        }
    }

    /// Fails unless every column the formula reads is a number column with no
    /// process-mining role in `columns`.
    pub fn validate(&self, columns: &[ColumnMapping]) -> Result<(), String> {
        for name in self.columns() {
            let column = columns
                .iter()
                .find(|c| c.name == name)
                .ok_or_else(|| format!("[{name}] matches no column."))?;
            if column.role != ColumnRole::Other || !column.column_type.is_numeric() {
                return Err(format!("[{name}] is not a number column."));
            }
        }
        Ok(())
    }

    /// The Float64 expression for this formula. A null operand, a division by
    /// zero or any other non-finite result reads as null.
    pub fn to_expr(&self) -> Expr {
        let value = self.build();
        when(value.clone().is_finite())
            .then(value)
            .otherwise(lit(NULL).cast(DataType::Float64))
    }

    fn build(&self) -> Expr {
        match self {
            Formula::Column { name } => col(name.as_str()).cast(DataType::Float64),
            Formula::Number { value } => lit(*value),
            Formula::Negate { operand } => lit(0.0) - operand.build(),
            Formula::Binary { op, left, right } => {
                let (left, right) = (left.build(), right.build());
                match op {
                    Operator::Add => left + right,
                    Operator::Subtract => left - right,
                    Operator::Multiply => left * right,
                    Operator::Divide => left / right,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn formula(json: &str) -> Formula {
        serde_json::from_str(json).unwrap()
    }

    fn column(name: &str) -> String {
        format!(r#"{{"kind":"column","name":"{name}"}}"#)
    }

    fn binary(op: &str, left: &str, right: &str) -> String {
        format!(r#"{{"kind":"binary","op":"{op}","left":{left},"right":{right}}}"#)
    }

    fn number(value: f64) -> String {
        format!(r#"{{"kind":"number","value":{value}}}"#)
    }

    fn evaluate(formula: &Formula, df: DataFrame) -> Vec<Option<f64>> {
        df.lazy()
            .select([formula.to_expr().alias("value")])
            .collect()
            .unwrap()
            .column("value")
            .unwrap()
            .f64()
            .unwrap()
            .iter()
            .collect()
    }

    fn columns() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"integer","scope":"event"},
              {"name":"expense","role":"other","type":"float","scope":"event"},
              {"name":"points","role":"other","type":"integer","scope":"event"},
              {"name":"Resource","role":"other","type":"string","scope":"event"}
            ]"#,
        )
        .unwrap()
    }

    #[test]
    fn reads_the_tree_the_frontend_sends() {
        let f = formula(&binary(
            "+",
            &column("a"),
            &format!(r#"{{"kind":"negate","operand":{}}}"#, number(2.5)),
        ));
        let df = df!("a" => [1.0, 2.0]).unwrap();
        assert_eq!(evaluate(&f, df), [Some(-1.5), Some(-0.5)]);
    }

    #[test]
    fn follows_the_tree_not_left_to_right_order() {
        // [a] - ([b] * 2), as the parser builds it for `[a] - [b] * 2`.
        let f = formula(&binary(
            "-",
            &column("a"),
            &binary("*", &column("b"), &number(2.0)),
        ));
        let df = df!("a" => [10.0], "b" => [3.0]).unwrap();
        assert_eq!(evaluate(&f, df), [Some(4.0)]);
    }

    #[test]
    fn divides_integers_as_floats() {
        let f = formula(&binary("/", &column("a"), &column("b")));
        let df = df!("a" => [1i64, 7], "b" => [2i64, 2]).unwrap();
        assert_eq!(evaluate(&f, df), [Some(0.5), Some(3.5)]);
    }

    #[test]
    fn a_null_operand_or_a_non_finite_result_reads_as_empty() {
        let f = formula(&binary("/", &column("a"), &column("b")));
        let df = df!(
            "a" => [Some(13.0), None, Some(0.0), Some(0.0)],
            "b" => [Some(0.0), Some(4.0), Some(0.0), Some(2.0)]
        )
        .unwrap();
        assert_eq!(evaluate(&f, df), [None, None, None, Some(0.0)]);
    }

    #[test]
    fn lists_each_column_once() {
        let f = formula(&binary(
            "+",
            &column("b"),
            &binary("*", &column("a"), &column("b")),
        ));
        assert_eq!(f.columns().into_iter().collect::<Vec<_>>(), ["a", "b"]);
    }

    #[test]
    fn accepts_number_columns_with_no_role() {
        let f = formula(&binary("/", &column("expense"), &column("points")));
        assert!(f.validate(&columns()).is_ok());
    }

    #[test]
    fn rejects_unknown_text_and_role_columns() {
        for (name, error) in [
            ("missing", "[missing] matches no column."),
            ("Resource", "[Resource] is not a number column."),
            ("case", "[case] is not a number column."),
        ] {
            assert_eq!(
                formula(&column(name)).validate(&columns()).unwrap_err(),
                error
            );
        }
    }
}
