//! A Custom Attribute's formula as the frontend parsed it. Rust never reads
//! formula text: it receives this tree, checks the columns it names against the
//! attribute's scope and folds it into a Polars expression.

use crate::column_mapping::{require_role, CaseResolution, ColumnMapping, ColumnRole};
use crate::filters::timestamp_millis;
use polars::prelude::*;
use serde::Deserialize;
use std::collections::BTreeSet;

/// Whether an attribute holds one value per event or one per case. Fixed when
/// the attribute is created.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AttributeScope {
    #[default]
    Event,
    Case,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AggregateFunction {
    Sum,
    Mean,
    Median,
    Min,
    Max,
    First,
    Last,
}

impl AggregateFunction {
    fn name(self) -> &'static str {
        match self {
            Self::Sum => "sum",
            Self::Mean => "mean",
            Self::Median => "median",
            Self::Min => "min",
            Self::Max => "max",
            Self::First => "first",
            Self::Last => "last",
        }
    }
}

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
    Aggregate {
        #[serde(rename = "fn")]
        function: AggregateFunction,
        column: String,
    },
    Count,
    Duration,
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

/// A node that reads the case or its columns. Numbers and operators are allowed
/// in every scope and never appear here.
#[derive(Debug, Clone, Copy)]
enum Operand<'a> {
    Column(&'a str),
    Aggregate(AggregateFunction, &'a str),
    Count,
    Duration,
}

/// What an operand needs to be valid in one scope.
enum Rule {
    Allowed,
    Refused,
    EventColumn,
    CaseColumn,
}

/// The validation table, mirrored by `RULES` in
/// `src/lib/custom-attributes/utils/validate.ts`.
fn rule(operand: Operand, scope: AttributeScope) -> Rule {
    use AttributeScope::{Case, Event};
    match (operand, scope) {
        (Operand::Column(_), Event) => Rule::EventColumn,
        (Operand::Column(_), Case) => Rule::CaseColumn,
        (Operand::Aggregate(..), Event) => Rule::Refused,
        (Operand::Aggregate(..), Case) => Rule::EventColumn,
        (Operand::Count | Operand::Duration, Event) => Rule::Refused,
        (Operand::Count | Operand::Duration, Case) => Rule::Allowed,
    }
}

/// The first operand a formula may not read. `operand` is the column name, or
/// the function written as `sum()` when the function itself is refused.
#[derive(Debug, PartialEq)]
pub struct Refusal {
    pub operand: String,
    pub message: String,
}

impl<'a> Operand<'a> {
    fn column(self) -> Option<&'a str> {
        match self {
            Operand::Column(name) | Operand::Aggregate(_, name) => Some(name),
            Operand::Count | Operand::Duration => None,
        }
    }

    fn function(self) -> Option<&'static str> {
        match self {
            Operand::Column(_) => None,
            Operand::Aggregate(function, _) => Some(function.name()),
            Operand::Count => Some("count"),
            Operand::Duration => Some("duration"),
        }
    }
}

impl Formula {
    fn walk<'a>(&'a self, operands: &mut Vec<Operand<'a>>) {
        match self {
            Formula::Column { name } => operands.push(Operand::Column(name)),
            Formula::Aggregate { function, column } => {
                operands.push(Operand::Aggregate(*function, column))
            }
            Formula::Count => operands.push(Operand::Count),
            Formula::Duration => operands.push(Operand::Duration),
            Formula::Number { .. } => {}
            Formula::Negate { operand } => operand.walk(operands),
            Formula::Binary { left, right, .. } => {
                left.walk(operands);
                right.walk(operands);
            }
        }
    }

    /// The operands in the order they are written.
    fn operand_nodes(&self) -> Vec<Operand<'_>> {
        let mut operands = Vec::new();
        self.walk(&mut operands);
        operands
    }

    /// Every column the formula names, directly or as an aggregate's argument,
    /// each once.
    pub fn operands(&self) -> BTreeSet<&str> {
        self.operand_nodes()
            .into_iter()
            .filter_map(Operand::column)
            .collect()
    }

    fn has_duration(&self) -> bool {
        self.operand_nodes()
            .iter()
            .any(|operand| matches!(operand, Operand::Duration))
    }

    /// The columns evaluating the formula reads: its operands, plus the case id
    /// for case scope and the complete timestamp when it holds `duration()`.
    pub fn read_columns(
        &self,
        scope: AttributeScope,
        columns: &[ColumnMapping],
    ) -> Result<Vec<String>, String> {
        let mut names: Vec<String> = self.operands().into_iter().map(str::to_owned).collect();
        if scope == AttributeScope::Case {
            names.push(require_role(columns, ColumnRole::CaseId)?.to_owned());
        }
        if self.has_duration() {
            names.push(require_role(columns, ColumnRole::CompleteTimestamp)?.to_owned());
        }
        names.sort();
        names.dedup();
        Ok(names)
    }

    /// The first operand `scope` refuses, by the validation table.
    pub fn refusal(&self, scope: AttributeScope, columns: &[ColumnMapping]) -> Option<Refusal> {
        self.operand_nodes().into_iter().find_map(|operand| {
            let wanted = match rule(operand, scope) {
                Rule::Allowed => return None,
                Rule::Refused => {
                    let function = operand.function()?;
                    return Some(Refusal {
                        operand: format!("{function}()"),
                        message: format!("{function}() is only available for Case attributes."),
                    });
                }
                Rule::EventColumn => AttributeScope::Event,
                Rule::CaseColumn => AttributeScope::Case,
            };
            let name = operand.column()?;
            column_refusal(name, wanted, columns).map(|message| Refusal {
                operand: name.to_owned(),
                message,
            })
        })
    }

    /// Fails unless `scope` allows every operand, by the validation table.
    pub fn validate(&self, scope: AttributeScope, columns: &[ColumnMapping]) -> Result<(), String> {
        match self.refusal(scope, columns) {
            Some(refusal) => Err(refusal.message),
            None => Ok(()),
        }
    }

    /// The Float64 expression for this formula. Event scope is row-wise; case
    /// scope is an aggregation, to be evaluated inside a `group_by` on the case
    /// id. A null operand, a division by zero or any other non-finite result
    /// reads as null.
    pub fn to_expr(
        &self,
        scope: AttributeScope,
        columns: &[ColumnMapping],
    ) -> Result<Expr, String> {
        let value = self.build(scope, columns)?;
        Ok(when(value.clone().is_finite())
            .then(value)
            .otherwise(lit(NULL).cast(DataType::Float64)))
    }

    fn build(&self, scope: AttributeScope, columns: &[ColumnMapping]) -> Result<Expr, String> {
        Ok(match (self, scope) {
            (Formula::Column { name }, AttributeScope::Event) => number(name),
            (Formula::Column { name }, AttributeScope::Case) => {
                let resolution = columns
                    .iter()
                    .find(|c| &c.name == name)
                    .and_then(|c| c.scope.resolution());
                match resolution {
                    Some(CaseResolution::Last) => number(name).last(),
                    _ => number(name).first(),
                }
            }
            (Formula::Aggregate { function, column }, AttributeScope::Case) => {
                let x = number(column);
                match function {
                    AggregateFunction::Sum => when(x.clone().count().gt(lit(0)))
                        .then(x.sum())
                        .otherwise(lit(NULL).cast(DataType::Float64)),
                    AggregateFunction::Mean => x.mean(),
                    AggregateFunction::Median => x.median(),
                    AggregateFunction::Min => x.min(),
                    AggregateFunction::Max => x.max(),
                    AggregateFunction::First => x.first_non_null(),
                    AggregateFunction::Last => x.last_non_null(),
                }
            }
            (Formula::Count, AttributeScope::Case) => len().cast(DataType::Float64),
            (Formula::Duration, AttributeScope::Case) => {
                let timestamp = require_role(columns, ColumnRole::CompleteTimestamp)?;
                let ts = timestamp_millis(timestamp).cast(DataType::Int64);
                (ts.clone().max() - ts.min()).cast(DataType::Float64) / lit(86_400_000.0)
            }
            (
                Formula::Aggregate { .. } | Formula::Count | Formula::Duration,
                AttributeScope::Event,
            ) => return Err("Functions are only available for Case attributes.".into()),
            (Formula::Number { value }, _) => lit(*value),
            (Formula::Negate { operand }, _) => lit(0.0) - operand.build(scope, columns)?,
            (Formula::Binary { op, left, right }, _) => {
                let (left, right) = (left.build(scope, columns)?, right.build(scope, columns)?);
                match op {
                    Operator::Add => left + right,
                    Operator::Subtract => left - right,
                    Operator::Multiply => left * right,
                    Operator::Divide => left / right,
                }
            }
        })
    }
}

fn number(name: &str) -> Expr {
    col(name).cast(DataType::Float64)
}

/// Why `name` cannot be read where a number column of the `wanted` column scope
/// is needed, or `None` when it can.
fn column_refusal(name: &str, wanted: AttributeScope, columns: &[ColumnMapping]) -> Option<String> {
    let Some(column) = columns.iter().find(|c| c.name == name) else {
        return Some(format!("[{name}] matches no column."));
    };
    if column.role != ColumnRole::Other || !column.column_type.is_numeric() {
        return Some(format!("[{name}] is not a number column."));
    }
    match (wanted, column.scope.resolution()) {
        (AttributeScope::Event, Some(_)) => Some(format!("[{name}] is a case column.")),
        (AttributeScope::Case, None) => Some(format!("[{name}] is an event column.")),
        _ => None,
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

    fn aggregate(function: &str, column: &str) -> String {
        format!(r#"{{"kind":"aggregate","fn":"{function}","column":"{column}"}}"#)
    }

    const COUNT: &str = r#"{"kind":"count"}"#;
    const DURATION: &str = r#"{"kind":"duration"}"#;
    const DAY_MS: i64 = 86_400_000;

    fn evaluate(formula: &Formula, df: DataFrame) -> Vec<Option<f64>> {
        df.lazy()
            .select([formula
                .to_expr(AttributeScope::Event, &[])
                .unwrap()
                .alias("value")])
            .collect()
            .unwrap()
            .column("value")
            .unwrap()
            .f64()
            .unwrap()
            .iter()
            .collect()
    }

    fn mapping_fixture() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"},
              {"name":"x","role":"other","type":"integer","scope":"event"},
              {"name":"first_x","role":"other","type":"integer","scope":"case","caseResolution":"first"},
              {"name":"last_x","role":"other","type":"integer","scope":"case","caseResolution":"last"}
            ]"#,
        )
        .unwrap()
    }

    /// Case a: three events over two days, `x` = 1, null, 4. Case b: one event,
    /// `x` null. Case c: two events, the second with no timestamp.
    fn case_log() -> DataFrame {
        let ts = Column::new(
            "ts".into(),
            [
                Some(0i64),
                Some(DAY_MS),
                Some(2 * DAY_MS),
                Some(5 * DAY_MS),
                Some(0),
                None,
            ],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .unwrap();
        let mut df = df!(
            "case" => ["a", "a", "a", "b", "c", "c"],
            "x" => [Some(1i64), None, Some(4), None, Some(3), Some(5)],
            "first_x" => [Some(7i64), Some(7), Some(7), Some(2), Some(6), Some(6)],
            "last_x" => [Some(1i64), Some(2), None, Some(2), Some(6), Some(6)]
        )
        .unwrap();
        df.with_column(ts).unwrap();
        df
    }

    /// The formula's value per case, in case order.
    fn per_case(json: &str) -> Vec<Option<f64>> {
        let expr = formula(json)
            .to_expr(AttributeScope::Case, &mapping_fixture())
            .unwrap();
        case_log()
            .lazy()
            .group_by_stable([col("case")])
            .agg([expr.alias("value")])
            .collect()
            .unwrap()
            .column("value")
            .unwrap()
            .f64()
            .unwrap()
            .iter()
            .collect()
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
    fn reads_the_function_nodes_the_frontend_sends() {
        assert!(matches!(
            formula(&aggregate("median", "x")),
            Formula::Aggregate {
                function: AggregateFunction::Median,
                ref column
            } if column == "x"
        ));
        assert!(matches!(formula(COUNT), Formula::Count));
        assert!(matches!(formula(DURATION), Formula::Duration));
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
    fn lists_each_operand_once() {
        let f = formula(&binary(
            "+",
            &column("b"),
            &binary("*", &aggregate("sum", "a"), &column("b")),
        ));
        assert_eq!(f.operands().into_iter().collect::<Vec<_>>(), ["a", "b"]);
    }

    #[test]
    fn reads_the_case_id_for_case_scope_and_the_timestamp_for_duration() {
        let columns = mapping_fixture();
        let sum = formula(&aggregate("sum", "x"));
        assert_eq!(
            sum.read_columns(AttributeScope::Case, &columns).unwrap(),
            ["case", "x"]
        );
        let per_day = formula(&binary("/", &aggregate("sum", "x"), DURATION));
        assert_eq!(
            per_day
                .read_columns(AttributeScope::Case, &columns)
                .unwrap(),
            ["case", "ts", "x"]
        );
        let event = formula(&column("x"));
        assert_eq!(
            event.read_columns(AttributeScope::Event, &columns).unwrap(),
            ["x"]
        );
    }

    #[test]
    fn needs_no_timestamp_column_without_duration() {
        let columns: Vec<ColumnMapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"x","role":"other","type":"float","scope":"event"}
            ]"#,
        )
        .unwrap();
        let sum = formula(&aggregate("sum", "x"));
        assert!(sum.to_expr(AttributeScope::Case, &columns).is_ok());
        assert!(formula(DURATION)
            .to_expr(AttributeScope::Case, &columns)
            .is_err());
    }

    #[test]
    fn sums_skip_nulls_and_an_all_null_case_is_empty() {
        assert_eq!(
            per_case(&aggregate("sum", "x")),
            [Some(5.0), None, Some(8.0)]
        );
    }

    #[test]
    fn means_and_medians_skip_nulls() {
        assert_eq!(
            per_case(&aggregate("mean", "x")),
            [Some(2.5), None, Some(4.0)]
        );
        assert_eq!(
            per_case(&aggregate("median", "x")),
            [Some(2.5), None, Some(4.0)]
        );
    }

    #[test]
    fn min_and_max_of_integers_are_floats() {
        assert_eq!(
            per_case(&aggregate("min", "x")),
            [Some(1.0), None, Some(3.0)]
        );
        assert_eq!(
            per_case(&aggregate("max", "x")),
            [Some(4.0), None, Some(5.0)]
        );
    }

    #[test]
    fn first_and_last_skip_nulls() {
        assert_eq!(
            per_case(&aggregate("first", "x")),
            [Some(1.0), None, Some(3.0)]
        );
        assert_eq!(
            per_case(&aggregate("last", "x")),
            [Some(4.0), None, Some(5.0)]
        );
    }

    #[test]
    fn count_counts_every_event_including_empty_values() {
        assert_eq!(per_case(COUNT), [Some(3.0), Some(1.0), Some(2.0)]);
    }

    #[test]
    fn duration_is_the_span_in_days_skipping_null_timestamps() {
        assert_eq!(per_case(DURATION), [Some(2.0), Some(0.0), Some(0.0)]);
    }

    #[test]
    fn a_single_event_case_divided_by_its_duration_is_empty() {
        let f = binary("/", COUNT, DURATION);
        assert_eq!(per_case(&f), [Some(1.5), None, None]);
    }

    #[test]
    fn a_case_column_reads_the_row_its_resolution_names_even_when_empty() {
        assert_eq!(
            per_case(&column("first_x")),
            [Some(7.0), Some(2.0), Some(6.0)]
        );
        assert_eq!(per_case(&column("last_x")), [None, Some(2.0), Some(6.0)]);
    }

    #[derive(Deserialize)]
    struct Fixture {
        columns: Vec<ColumnMapping>,
        cases: Vec<FixtureCase>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FixtureCase {
        name: String,
        scope: AttributeScope,
        formula: Formula,
        expected: serde_json::Value,
        #[serde(default)]
        typescript_only: bool,
    }

    #[test]
    fn refuses_what_the_shared_validation_table_refuses() {
        let fixture: Fixture =
            serde_json::from_str(include_str!("../../tests/fixtures/formula-validation.json"))
                .unwrap();
        for case in fixture.cases.iter().filter(|c| !c.typescript_only) {
            let refused = case
                .formula
                .refusal(case.scope, &fixture.columns)
                .map(|r| r.operand);
            let expected = case.expected["refused"].as_str().map(str::to_owned);
            assert_eq!(refused, expected, "{}", case.name);
        }
    }

    #[test]
    fn says_why_an_operand_is_refused() {
        let columns = mapping_fixture();
        for (json, scope, error) in [
            (
                column("missing"),
                AttributeScope::Event,
                "[missing] matches no column.",
            ),
            (
                column("case"),
                AttributeScope::Event,
                "[case] is not a number column.",
            ),
            (
                column("first_x"),
                AttributeScope::Event,
                "[first_x] is a case column.",
            ),
            (column("x"), AttributeScope::Case, "[x] is an event column."),
            (
                aggregate("sum", "x"),
                AttributeScope::Event,
                "sum() is only available for Case attributes.",
            ),
        ] {
            assert_eq!(formula(&json).validate(scope, &columns).unwrap_err(), error);
        }
    }
}
