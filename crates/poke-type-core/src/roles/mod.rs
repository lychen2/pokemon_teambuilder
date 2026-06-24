use serde::Serialize;

use crate::{schema::Config, showdown::normalize_name};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoleSummary {
    pub attack_bias: String,
    pub utility_roles: Vec<String>,
    pub structure_roles: Vec<String>,
}

pub fn analyze_roles(config: &Config) -> RoleSummary {
    RoleSummary {
        attack_bias: attack_bias(config),
        utility_roles: utility_roles(config),
        structure_roles: structure_roles(config),
    }
}

pub fn attack_bias(config: &Config) -> String {
    let atk = config.stats.atk as i32 + config.champion_points.atk as i32;
    let spa = config.stats.spa as i32 + config.champion_points.spa as i32;
    let damaging_moves = config
        .move_names
        .iter()
        .filter(|name| {
            !matches!(
                normalize_name(name).as_str(),
                "protect" | "tailwind" | "trickroom" | "fakeout"
            )
        })
        .count();
    if damaging_moves == 0 {
        return "support".into();
    }
    if (atk - spa).abs() <= 12 {
        "mixed".into()
    } else if atk > spa {
        "physical".into()
    } else {
        "special".into()
    }
}

pub fn utility_roles(config: &Config) -> Vec<String> {
    let moves = config
        .move_names
        .iter()
        .map(|name| normalize_name(name))
        .collect::<Vec<_>>();
    let ability = normalize_name(&config.ability);
    let item = normalize_name(&config.item);
    let mut roles = Vec::<String>::new();
    add_if(
        &mut roles,
        moves.iter().any(|name| name == "fakeout"),
        "fakeout",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| name == "tailwind"),
        "tailwind",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| name == "trickroom"),
        "trickroom",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| {
            ["icywind", "electroweb", "scaryface", "rocktomb"].contains(&name.as_str())
        }),
        "speeddebuff",
    );
    add_if(
        &mut roles,
        moves
            .iter()
            .any(|name| ["thunderwave", "nuzzle", "glare", "stunspore"].contains(&name.as_str())),
        "paralysiscontrol",
    );
    add_if(
        &mut roles,
        moves
            .iter()
            .any(|name| ["followme", "ragepowder"].contains(&name.as_str())),
        "redirection",
    );
    add_if(
        &mut roles,
        moves
            .iter()
            .any(|name| ["wideguard", "quickguard"].contains(&name.as_str())),
        "guard",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| name == "wideguard"),
        "wideguard",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| name == "quickguard"),
        "quickguard",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| name == "helpinghand"),
        "helpinghand",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| {
            ["partingshot", "uturn", "voltswitch", "flipturn"].contains(&name.as_str())
        }),
        "pivot",
    );
    add_if(
        &mut roles,
        moves.iter().any(|name| {
            [
                "taunt",
                "encore",
                "disable",
                "willowisp",
                "spore",
                "sleeppowder",
                "yawn",
            ]
            .contains(&name.as_str())
        }),
        "disruption",
    );
    add_if(
        &mut roles,
        moves
            .iter()
            .any(|name| ["reflect", "lightscreen", "auroraveil"].contains(&name.as_str())),
        "screens",
    );
    add_if(&mut roles, ability == "intimidate", "intimidate");
    add_if(
        &mut roles,
        ["drought", "drizzle", "sandstream", "snowwarning"].contains(&ability.as_str()),
        "weathersetter",
    );
    add_if(
        &mut roles,
        ["chlorophyll", "swiftswim", "sandrush", "slushrush"].contains(&ability.as_str()),
        "weathersweeper",
    );
    add_if(
        &mut roles,
        ["electricsurge", "grassysurge", "psychicsurge", "mistysurge"].contains(&ability.as_str()),
        "terrainsetter",
    );
    add_if(
        &mut roles,
        ["clearamulet", "covertcloak", "safetygoggles", "focussash"].contains(&item.as_str()),
        item.as_str(),
    );
    roles
}

pub fn structure_roles(config: &Config) -> Vec<String> {
    let offense = u16::max(config.stats.atk, config.stats.spa);
    let bulk =
        ((config.stats.hp as u32 + config.stats.def as u32 + config.stats.spd as u32) / 3) as u16;
    let mut roles = Vec::<String>::new();
    add_if(
        &mut roles,
        offense >= 155 && config.stats.spe >= 135,
        "sweeper",
    );
    add_if(
        &mut roles,
        offense >= 130 && config.stats.spe <= 90,
        "slowattacker",
    );
    add_if(&mut roles, bulk >= 130, "tank");
    add_if(&mut roles, !utility_roles(config).is_empty(), "support");
    if roles.is_empty() {
        roles.push("attacker".into());
    }
    roles
}

fn add_if(roles: &mut Vec<String>, condition: bool, role: &str) {
    if condition && !roles.iter().any(|existing| existing == role) {
        roles.push(role.to_owned());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{dex::Dataset, showdown::parse_showdown_text};
    use std::path::Path;

    #[test]
    fn detects_basic_roles() {
        let dataset = Dataset::load_from_repo(Path::new("../..")).unwrap();
        let text = include_str!("../../../../tests/fixtures/basic-team.txt");
        let parsed = parse_showdown_text(text, &dataset).unwrap();
        let summary = analyze_roles(&parsed.configs[0]);
        assert_eq!(summary.attack_bias, "physical");
        assert!(
            summary
                .structure_roles
                .iter()
                .any(|role| role == "attacker" || role == "sweeper" || role == "slowattacker")
        );
    }
}
