use crate::schema::Config;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeamValidation {
    pub errors: Vec<TeamValidationIssue>,
    pub warnings: Vec<TeamValidationIssue>,
    pub mega_count: usize,
    pub size: usize,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeamValidationIssue {
    pub code: String,
    pub message: String,
    pub config_name: String,
}

pub fn validate_team(team: &[Config]) -> TeamValidation {
    let mega_count = team.iter().filter(|config| is_mega(config)).count();
    let mut result = TeamValidation {
        errors: Vec::new(),
        warnings: Vec::new(),
        mega_count,
        size: team.len(),
    };
    if team.len() > 6 {
        result
            .errors
            .push(issue("team-size", "Team cannot exceed 6 members", ""));
    }
    if mega_count > 2 {
        result
            .errors
            .push(issue("mega-count", "Team cannot exceed 2 Mega Pokemon", ""));
    }
    for config in team {
        if config.move_names.len() != 4 {
            result.errors.push(issue(
                "move-count",
                "Pokemon must have exactly 4 moves",
                &config.display_name,
            ));
        }
        let total = crate::champions::point_total(&config.champion_points);
        if total > crate::champions::CHAMPION_TOTAL_POINTS {
            result.errors.push(issue(
                "points-total",
                "Champion points cannot exceed 66",
                &config.display_name,
            ));
        }
        if !crate::champions::validate_points(&config.champion_points).is_empty()
            && [
                config.champion_points.hp,
                config.champion_points.atk,
                config.champion_points.def,
                config.champion_points.spa,
                config.champion_points.spd,
                config.champion_points.spe,
            ]
            .iter()
            .any(|value| *value > crate::champions::CHAMPION_STAT_CAP)
        {
            result.errors.push(issue(
                "points-stat-cap",
                "A stat cannot exceed 32 points",
                &config.display_name,
            ));
        }
    }
    result
}

fn issue(code: &str, message: &str, config_name: &str) -> TeamValidationIssue {
    TeamValidationIssue {
        code: code.to_owned(),
        message: message.to_owned(),
        config_name: config_name.to_owned(),
    }
}

fn is_mega(config: &Config) -> bool {
    config.species_id.to_ascii_lowercase().contains("mega")
        || config.species_name.to_ascii_lowercase().contains("mega")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{ChampionPoints, Stats};

    #[test]
    fn rejects_more_than_six_members() {
        let team = vec![minimal_config(); 7];
        let result = validate_team(&team);
        assert!(result.errors.iter().any(|issue| issue.code == "team-size"));
    }

    #[test]
    fn rejects_more_than_sixty_six_points() {
        let mut config = minimal_config();
        config.champion_points.hp = 32;
        config.champion_points.atk = 32;
        config.champion_points.spe = 32;
        let result = validate_team(&[config]);
        assert!(
            result
                .errors
                .iter()
                .any(|issue| issue.code == "points-total")
        );
    }

    fn minimal_config() -> Config {
        Config {
            id: "garchomp-1".into(),
            species_id: "garchomp".into(),
            species_name: "Garchomp".into(),
            display_name: "Garchomp".into(),
            note: "".into(),
            types: vec!["Dragon".into(), "Ground".into()],
            ability: "Rough Skin".into(),
            item: "Life Orb".into(),
            tera_type: "".into(),
            nature: "Jolly".into(),
            level: 50,
            champion_points: ChampionPoints {
                hp: 2,
                atk: 32,
                def: 0,
                spa: 0,
                spd: 0,
                spe: 32,
            },
            move_names: vec![
                "Dragon Claw".into(),
                "Protect".into(),
                "Earthquake".into(),
                "Stomping Tantrum".into(),
            ],
            stats: Stats::default(),
        }
    }
}
