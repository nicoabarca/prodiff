//! A Group is a named set of cases: the Original, or a Filter List applied to
//! the Event Log and written to `groups/{group_id}.parquet`.
//!
//! The row comes before the file — a Group exists as soon as the user names it,
//! and the file appears at the first Apply — so a Parquet without a row is not
//! reachable. Deletion reverses that order.

pub mod commands;
pub mod storage;
