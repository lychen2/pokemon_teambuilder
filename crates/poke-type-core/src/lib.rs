pub mod analysis;
pub mod battle;
pub mod champions;
pub mod damage;
pub mod dex;
pub mod matchup;
pub mod output;
pub mod recommend;
pub mod records;
pub mod roles;
pub mod schema;
pub mod showdown;
pub mod team;
pub mod usage;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
