use crate::schema::{ChampionPoints, Stats};

pub const CHAMPION_TOTAL_POINTS: u16 = 66;
pub const CHAMPION_STAT_CAP: u16 = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BaseStats {
    pub hp: u16,
    pub atk: u16,
    pub def: u16,
    pub spa: u16,
    pub spd: u16,
    pub spe: u16,
}

pub fn point_total(points: &ChampionPoints) -> u16 {
    points.hp + points.atk + points.def + points.spa + points.spd + points.spe
}

pub fn validate_points(points: &ChampionPoints) -> Vec<&'static str> {
    let mut errors = Vec::new();
    if point_total(points) > CHAMPION_TOTAL_POINTS {
        errors.push("points-total");
    }
    if [
        points.hp, points.atk, points.def, points.spa, points.spd, points.spe,
    ]
    .iter()
    .any(|value| *value > CHAMPION_STAT_CAP)
    {
        errors.push("points-stat-cap");
    }
    errors
}

pub fn calculate_stats(base: &BaseStats, points: &ChampionPoints, nature: &str) -> Stats {
    Stats {
        hp: base.hp + 75 + points.hp,
        atk: apply_nature(base.atk + 20 + points.atk, nature_effect(nature, "atk")),
        def: apply_nature(base.def + 20 + points.def, nature_effect(nature, "def")),
        spa: apply_nature(base.spa + 20 + points.spa, nature_effect(nature, "spa")),
        spd: apply_nature(base.spd + 20 + points.spd, nature_effect(nature, "spd")),
        spe: apply_nature(base.spe + 20 + points.spe, nature_effect(nature, "spe")),
    }
}

fn apply_nature(value: u16, effect: i8) -> u16 {
    match effect {
        1 => ((value as f32) * 1.1).floor() as u16,
        -1 => ((value as f32) * 0.9).floor() as u16,
        _ => value,
    }
}

fn nature_effect(nature: &str, stat: &str) -> i8 {
    let Some((plus, minus)) = nature_pair(nature) else {
        return 0;
    };
    if stat == plus {
        1
    } else if stat == minus {
        -1
    } else {
        0
    }
}

fn nature_pair(nature: &str) -> Option<(&'static str, &'static str)> {
    match nature {
        "Adamant" => Some(("atk", "spa")),
        "Bold" => Some(("def", "atk")),
        "Brave" => Some(("atk", "spe")),
        "Calm" => Some(("spd", "atk")),
        "Careful" => Some(("spd", "spa")),
        "Gentle" => Some(("spd", "def")),
        "Hasty" => Some(("spe", "def")),
        "Impish" => Some(("def", "spa")),
        "Jolly" => Some(("spe", "spa")),
        "Lax" => Some(("def", "spd")),
        "Lonely" => Some(("atk", "def")),
        "Mild" => Some(("spa", "def")),
        "Modest" => Some(("spa", "atk")),
        "Naive" => Some(("spe", "spd")),
        "Naughty" => Some(("atk", "spd")),
        "Quiet" => Some(("spa", "spe")),
        "Rash" => Some(("spa", "spd")),
        "Relaxed" => Some(("def", "spe")),
        "Sassy" => Some(("spd", "spe")),
        "Timid" => Some(("spe", "atk")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::ChampionPoints;

    #[test]
    fn normalizes_points_to_non_negative_integers() {
        let points = ChampionPoints {
            hp: 32,
            atk: 32,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 2,
        };
        assert_eq!(point_total(&points), 66);
    }

    #[test]
    fn calculates_champion_stats_with_nature() {
        let base = BaseStats {
            hp: 108,
            atk: 130,
            def: 95,
            spa: 80,
            spd: 85,
            spe: 102,
        };
        let points = ChampionPoints {
            hp: 2,
            atk: 32,
            def: 0,
            spa: 0,
            spd: 0,
            spe: 32,
        };
        let stats = calculate_stats(&base, &points, "Jolly");
        assert_eq!(stats.hp, 185);
        assert!(stats.atk > 130);
        assert!(stats.spe > 150);
    }
}
