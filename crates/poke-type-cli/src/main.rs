use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use poke_type_core::{
    analysis::analyze_team,
    damage::calculate_damage_pair,
    dex::Dataset,
    matchup::{analyze_matchup, build_opponent_library},
    output::calculate_output_tiers,
    recommend::recommend_team_members,
    records::{BattleRecord, records_response, validate_battle_record},
    showdown::{export_team_text, parse_showdown_text},
    team::validate_team,
    usage::{usage_detail, usage_rows},
};

#[derive(Debug, Parser)]
#[command(name = "poke-type-cli")]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Parse {
        #[arg(long)]
        team: PathBuf,
    },
    Export {
        #[arg(long)]
        team: PathBuf,
    },
    ValidateTeam {
        #[arg(long)]
        team: PathBuf,
    },
    Usage {
        #[arg(long)]
        species: Option<String>,
        #[arg(long)]
        search: Option<String>,
    },
    Output {
        #[arg(long)]
        library: PathBuf,
    },
    Records {
        #[arg(long)]
        record: Option<PathBuf>,
        #[arg(long)]
        records: Option<PathBuf>,
        #[arg(long)]
        team_id: Option<String>,
    },
    Analyze {
        #[arg(long)]
        team: PathBuf,
    },
    Recommend {
        #[arg(long)]
        team: PathBuf,
        #[arg(long, default_value_t = 10)]
        limit: usize,
    },
    Matchup {
        #[arg(long)]
        team: PathBuf,
        #[arg(long)]
        opponent: PathBuf,
    },
    Vgcpastes {
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    Damage {
        #[arg(long)]
        attacker: PathBuf,
        #[arg(long)]
        defender: PathBuf,
    },
}

fn main() {
    if let Err(error) = run() {
        eprintln!("错误: {error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args = Args::parse();
    match args.command {
        Command::Parse { team } => {
            let (dataset, text) = load_team_text(&team)?;
            let result = parse_showdown_text(&text, &dataset)?;
            serde_json::to_writer(std::io::stdout(), &result)?;
            println!();
        }
        Command::Export { team } => {
            let (dataset, text) = load_team_text(&team)?;
            let result = parse_showdown_text(&text, &dataset)?;
            println!("{}", export_team_text(&result.configs));
        }
        Command::ValidateTeam { team } => {
            let (dataset, text) = load_team_text(&team)?;
            let result = parse_showdown_text(&text, &dataset)?;
            let validation = validate_team(&result.configs);
            serde_json::to_writer(std::io::stdout(), &validation)?;
            println!();
        }
        Command::Usage { species, search } => {
            let dataset = Dataset::load_from_repo(&repo_root()?)?;
            if let Some(species_id) = species {
                let detail = usage_detail(&dataset, &species_id)
                    .with_context(|| format!("usage species not found: {species_id}"))?;
                serde_json::to_writer(std::io::stdout(), &detail)?;
            } else {
                let rows = usage_rows(&dataset, search.as_deref());
                serde_json::to_writer(std::io::stdout(), &rows)?;
            }
            println!();
        }
        Command::Output { library } => {
            let (dataset, text) = load_team_text(&library)?;
            let result = parse_showdown_text(&text, &dataset)?;
            let tiers = calculate_output_tiers(&result.configs, &dataset);
            serde_json::to_writer(std::io::stdout(), &tiers)?;
            println!();
        }
        Command::Records {
            record,
            records,
            team_id,
        } => {
            if let Some(record_path) = record {
                let record: BattleRecord = read_json_file(&record_path)?;
                validate_battle_record(&record).map_err(anyhow::Error::msg)?;
                serde_json::to_writer(std::io::stdout(), &record)?;
            } else {
                let records_value: Vec<BattleRecord> = records
                    .as_deref()
                    .map(read_json_file)
                    .transpose()?
                    .unwrap_or_default();
                let response = records_response(&records_value, team_id.as_deref());
                serde_json::to_writer(std::io::stdout(), &response)?;
            }
            println!();
        }
        Command::Analyze { team } => {
            let (dataset, text) = load_team_text(&team)?;
            let result = parse_showdown_text(&text, &dataset)?;
            let analysis = analyze_team(&result.configs, &dataset);
            serde_json::to_writer(std::io::stdout(), &analysis)?;
            println!();
        }
        Command::Recommend { team, limit } => {
            let (dataset, text) = load_team_text(&team)?;
            let result = parse_showdown_text(&text, &dataset)?;
            let recommendations = recommend_team_members(&result.configs, &dataset, limit);
            serde_json::to_writer(std::io::stdout(), &recommendations)?;
            println!();
        }
        Command::Matchup { team, opponent } => {
            let (dataset, text) = load_team_text(&team)?;
            let result = parse_showdown_text(&text, &dataset)?;
            let opponent_path = resolve_input_path(&repo_root()?, &opponent);
            let opponent_text = fs::read_to_string(&opponent_path)
                .with_context(|| format!("failed to read {}", opponent_path.display()))?;
            let opponent_result = parse_showdown_text(&opponent_text, &dataset)?;
            let analysis = analyze_matchup(&result.configs, &opponent_result.configs, &dataset)
                .context("matchup requires non-empty team and opponent")?;
            serde_json::to_writer(std::io::stdout(), &analysis)?;
            println!();
        }
        Command::Vgcpastes { limit } => {
            let dataset = Dataset::load_from_repo(&repo_root()?)?;
            let library = build_opponent_library(&dataset, limit);
            serde_json::to_writer(std::io::stdout(), &library)?;
            println!();
        }
        Command::Damage { attacker, defender } => {
            let (dataset, attacker_config) = load_first_config(&attacker)?;
            let defender_config = load_first_config_with_dataset(&defender, &dataset)?;
            let summary = calculate_damage_pair(&attacker_config, &defender_config, &dataset);
            serde_json::to_writer(std::io::stdout(), &summary)?;
            println!();
        }
    }
    Ok(())
}
fn load_team_text(team: &Path) -> Result<(Dataset, String)> {
    let root = repo_root()?;
    let dataset = Dataset::load_from_repo(&root)?;
    let team_path = resolve_input_path(&root, team);
    let text = fs::read_to_string(&team_path)
        .with_context(|| format!("failed to read {}", team_path.display()))?;
    Ok((dataset, text))
}

fn load_first_config(path: &Path) -> Result<(Dataset, poke_type_core::schema::Config)> {
    let (dataset, text) = load_team_text(path)?;
    let result = parse_showdown_text(&text, &dataset)?;
    let config = result
        .configs
        .into_iter()
        .next()
        .context("input has no configs")?;
    Ok((dataset, config))
}

fn load_first_config_with_dataset(
    path: &Path,
    dataset: &Dataset,
) -> Result<poke_type_core::schema::Config> {
    let root = repo_root()?;
    let input_path = resolve_input_path(&root, path);
    let text = fs::read_to_string(&input_path)
        .with_context(|| format!("failed to read {}", input_path.display()))?;
    let result = parse_showdown_text(&text, dataset)?;
    result
        .configs
        .into_iter()
        .next()
        .context("input has no configs")
}

fn read_json_file<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let root = repo_root()?;
    let input_path = resolve_input_path(&root, path);
    let text = fs::read_to_string(&input_path)
        .with_context(|| format!("failed to read {}", input_path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("failed to parse {}", input_path.display()))
}

fn repo_root() -> Result<PathBuf> {
    let current = std::env::current_dir()?;
    for ancestor in current.ancestors() {
        if ancestor
            .join("poke_analysis-main/stats/pokedex.json")
            .exists()
        {
            return Ok(ancestor.to_path_buf());
        }
    }
    Ok(current)
}

fn resolve_input_path(root: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() || path.exists() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}
