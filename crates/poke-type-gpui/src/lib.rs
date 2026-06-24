use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use poke_type_core::{
    analysis::{TeamAnalysis, analyze_team},
    damage::{DamageSummary, calculate_damage_pair},
    dex::Dataset,
    matchup::{MatchupAnalysis, OpponentTeamEntry, analyze_matchup, build_opponent_library},
    output::{OutputTier, calculate_output_tiers},
    recommend::{RecommendationEntry, recommend_team_members},
    records::{BattleRecord, RecordsResponse, records_response, validate_battle_record},
    schema::{Config, ParseResult},
    showdown::{export_team_text, parse_showdown_text},
    team::{TeamValidation, validate_team},
    usage::{UsageDetail, UsageRow, usage_detail, usage_rows},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveView {
    Library,
    Analysis,
    Matchup,
    Recommendations,
    Usage,
    Damage,
    Speed,
    Output,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeamSidebarTab {
    Team,
    Saved,
    Import,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisTab {
    Coverage,
    Roles,
    Cores,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResultTab {
    pub id: &'static str,
    pub label: &'static str,
    pub view: ActiveView,
}

impl ActiveView {
    pub const RESULT_TABS: [ResultTab; 8] = [
        ResultTab {
            id: "library-tab",
            label: "配置库",
            view: ActiveView::Library,
        },
        ResultTab {
            id: "analysis-tab",
            label: "队伍分析",
            view: ActiveView::Analysis,
        },
        ResultTab {
            id: "matchup-tab",
            label: "对局分析",
            view: ActiveView::Matchup,
        },
        ResultTab {
            id: "recommendations-tab",
            label: "组队推荐",
            view: ActiveView::Recommendations,
        },
        ResultTab {
            id: "usage-tab",
            label: "使用率",
            view: ActiveView::Usage,
        },
        ResultTab {
            id: "damage-tab",
            label: "伤害工作台",
            view: ActiveView::Damage,
        },
        ResultTab {
            id: "speed-tab",
            label: "速度线",
            view: ActiveView::Speed,
        },
        ResultTab {
            id: "output-tab",
            label: "输出强度",
            view: ActiveView::Output,
        },
    ];

    pub fn result_tabs() -> &'static [ResultTab] {
        &Self::RESULT_TABS
    }
}

#[derive(Debug, Clone)]
pub struct Translator {
    pub source: String,
    translations: HashMap<String, String>,
}

impl Translator {
    pub fn load_from_repo(root: &Path) -> Result<Self> {
        let path = root.join("static/localization-data.json");
        let text = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let value = serde_json::from_str::<serde_json::Value>(&text)
            .with_context(|| format!("failed to parse {}", path.display()))?;
        let source = value
            .get("source")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        let mut translations = HashMap::new();
        if let Some(entries) = value
            .get("translations")
            .and_then(serde_json::Value::as_object)
        {
            for (key, value) in entries {
                if let Some(translated) = value.as_str() {
                    translations.insert(key.clone(), translated.to_owned());
                }
            }
        }
        Ok(Self {
            source,
            translations,
        })
    }

    pub fn translate(&self, text: &str) -> String {
        self.translations
            .get(text)
            .cloned()
            .unwrap_or_else(|| text.to_owned())
    }

    pub fn zh_with_en(&self, text: &str) -> String {
        let translated = self.translate(text);
        if translated == text {
            translated
        } else {
            format!("{translated} / {text}")
        }
    }
}

#[derive(Debug, Clone)]
pub struct GuiState {
    pub repo_root: PathBuf,
    pub dataset: Dataset,
    pub input_text: String,
    pub result: Option<WorkbenchState>,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub source_label: String,
    pub translator: Translator,
    pub active_view: ActiveView,
    pub team_sidebar_tab: TeamSidebarTab,
    pub analysis_tab: AnalysisTab,
    pub selected_opponent_index: usize,
    pub selected_attacker_index: usize,
    pub selected_defender_index: usize,
    pub selected_usage_index: usize,
}

impl GuiState {
    pub fn new(root: &Path) -> Result<Self> {
        let repo_root = repo_root_from(root);
        let dataset = Dataset::load_from_repo(&repo_root)?;
        let translator = Translator::load_from_repo(&repo_root)?;
        Ok(Self {
            repo_root,
            dataset,
            input_text: String::new(),
            result: None,
            error: None,
            notice: None,
            source_label: "剪贴板 / 示例 / 文件".into(),
            translator,
            active_view: ActiveView::Library,
            team_sidebar_tab: TeamSidebarTab::Team,
            analysis_tab: AnalysisTab::Coverage,
            selected_opponent_index: 0,
            selected_attacker_index: 0,
            selected_defender_index: 0,
            selected_usage_index: 0,
        })
    }

    pub fn paste_and_analyze(&mut self, text: String) {
        self.input_text = text;
        self.source_label = "剪贴板".into();
        self.analyze_current_text();
    }

    pub fn analyze_current_text(&mut self) {
        if self.input_text.trim().is_empty() {
            self.result = None;
            self.error = Some("请先粘贴或打开 Showdown 队伍文本。".into());
            self.notice = None;
            self.active_view = ActiveView::Library;
            self.team_sidebar_tab = TeamSidebarTab::Import;
            return;
        }
        match WorkbenchState::from_text(
            &self.repo_root,
            Path::new("<pasted-showdown>"),
            &self.input_text,
            &self.dataset,
        ) {
            Ok(mut result) => {
                self.clamp_selections(&result);
                result.recalculate_dynamic(
                    &self.dataset,
                    self.selected_opponent_index,
                    self.selected_attacker_index,
                    self.selected_defender_index,
                    self.selected_usage_index,
                );
                self.result = Some(result);
                self.error = None;
                self.notice = None;
                self.active_view = ActiveView::Analysis;
                self.team_sidebar_tab = TeamSidebarTab::Team;
            }
            Err(error) => {
                self.result = None;
                self.error = Some(format!("{error:#}"));
                self.notice = None;
                self.active_view = ActiveView::Library;
                self.team_sidebar_tab = TeamSidebarTab::Import;
            }
        }
    }

    pub fn load_team_path(&mut self, path: &Path) -> Result<()> {
        let resolved = resolve_input_path(&self.repo_root, path);
        let text = fs::read_to_string(&resolved)
            .with_context(|| format!("failed to read {}", resolved.display()))?;
        self.input_text = text;
        self.source_label = path.display().to_string();
        self.analyze_current_text();
        Ok(())
    }

    pub fn load_records_path(&mut self, path: &Path) -> Result<()> {
        let resolved = resolve_input_path(&self.repo_root, path);
        let text = fs::read_to_string(&resolved)
            .with_context(|| format!("failed to read {}", resolved.display()))?;
        self.import_records_text(&text)
    }

    pub fn import_records_text(&mut self, text: &str) -> Result<()> {
        let records = serde_json::from_str::<Vec<BattleRecord>>(text)
            .or_else(|_| serde_json::from_str::<BattleRecord>(text).map(|record| vec![record]))
            .context("failed to parse records JSON")?;
        for record in &records {
            validate_battle_record(record).map_err(anyhow::Error::msg)?;
        }
        let Some(result) = &mut self.result else {
            anyhow::bail!("请先分析队伍再导入战绩。");
        };
        result.records = records_response(&records, None);
        self.error = None;
        self.notice = Some(format!("已导入 {} 条战绩。", records.len()));
        self.active_view = ActiveView::Analysis;
        Ok(())
    }

    pub fn export_showdown_text(&self) -> Option<String> {
        self.result
            .as_ref()
            .map(|result| export_team_text(&result.parse.configs))
    }

    pub fn export_analysis_json(&self) -> Option<String> {
        self.result.as_ref().and_then(|result| {
            serde_json::to_string_pretty(&serde_json::json!({
                "parse": result.parse,
                "validation": result.validation,
                "analysis": result.analysis,
                "recommendations": result.recommendations,
                "matchup": result.matchup,
                "damage": result.damage,
                "usageDetail": result.usage_detail,
                "usageRows": result.usage_rows,
                "outputTiers": result.output_tiers,
                "opponents": result.opponents,
                "records": result.records,
                "activeView": format!("{:?}", self.active_view),
                "teamSidebarTab": format!("{:?}", self.team_sidebar_tab),
                "analysisTab": format!("{:?}", self.analysis_tab),
                "selectedOpponentIndex": self.selected_opponent_index,
                "selectedAttackerIndex": self.selected_attacker_index,
                "selectedDefenderIndex": self.selected_defender_index,
                "selectedUsageIndex": self.selected_usage_index,
            }))
            .ok()
        })
    }

    pub fn load_sample(&mut self) {
        self.input_text = include_str!("../../../tests/fixtures/basic-team.txt").to_owned();
        self.source_label = "示例队伍".into();
        self.analyze_current_text();
    }

    pub fn clear(&mut self) {
        self.input_text.clear();
        self.result = None;
        self.error = None;
        self.notice = None;
        self.active_view = ActiveView::Library;
        self.team_sidebar_tab = TeamSidebarTab::Team;
        self.analysis_tab = AnalysisTab::Coverage;
        self.source_label = "剪贴板 / 示例 / 文件".into();
        self.selected_opponent_index = 0;
        self.selected_attacker_index = 0;
        self.selected_defender_index = 0;
        self.selected_usage_index = 0;
    }

    pub fn select_view(&mut self, view: ActiveView) {
        self.active_view = view;
    }

    pub fn select_team_sidebar_tab(&mut self, tab: TeamSidebarTab) {
        self.team_sidebar_tab = tab;
    }

    pub fn select_analysis_tab(&mut self, tab: AnalysisTab) {
        self.analysis_tab = tab;
        self.active_view = ActiveView::Analysis;
    }

    pub fn select_opponent(&mut self, index: usize) {
        self.selected_opponent_index = index;
        self.recalculate_current();
        self.active_view = ActiveView::Matchup;
    }

    pub fn select_attacker(&mut self, index: usize) {
        self.selected_attacker_index = index;
        self.recalculate_current();
        self.active_view = ActiveView::Damage;
    }

    pub fn select_defender(&mut self, index: usize) {
        self.selected_defender_index = index;
        self.recalculate_current();
        self.active_view = ActiveView::Damage;
    }

    pub fn select_usage(&mut self, index: usize) {
        self.selected_usage_index = index;
        self.recalculate_current();
        self.active_view = ActiveView::Usage;
    }

    fn recalculate_current(&mut self) {
        let Some(mut result) = self.result.take() else {
            return;
        };
        self.clamp_selections(&result);
        result.recalculate_dynamic(
            &self.dataset,
            self.selected_opponent_index,
            self.selected_attacker_index,
            self.selected_defender_index,
            self.selected_usage_index,
        );
        self.result = Some(result);
    }

    fn clamp_selections(&mut self, result: &WorkbenchState) {
        if self.selected_opponent_index >= result.opponents.len() {
            self.selected_opponent_index = 0;
        }
        if self.selected_attacker_index >= result.parse.configs.len() {
            self.selected_attacker_index = 0;
        }
        let defender_len = result
            .selected_opponent_configs_at(self.selected_opponent_index)
            .len();
        if self.selected_defender_index >= defender_len {
            self.selected_defender_index = 0;
        }
        if self.selected_usage_index >= result.parse.configs.len() {
            self.selected_usage_index = 0;
        }
    }

    pub fn translate(&self, text: &str) -> String {
        self.translator.translate(text)
    }

    pub fn zh_with_en(&self, text: &str) -> String {
        self.translator.zh_with_en(text)
    }
}

#[derive(Debug, Clone)]
pub struct WorkbenchState {
    pub team_path: PathBuf,
    pub parse: ParseResult,
    pub validation: TeamValidation,
    pub analysis: TeamAnalysis,
    pub recommendations: Vec<RecommendationEntry>,
    pub matchup: Option<MatchupAnalysis>,
    pub damage: Option<DamageSummary>,
    pub usage_detail: Option<UsageDetail>,
    pub usage_rows: Vec<UsageRow>,
    pub output_tiers: Vec<OutputTier>,
    pub opponents: Vec<OpponentTeamEntry>,
    pub records: RecordsResponse,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamMemberRow {
    pub species_name: String,
    pub item: String,
    pub ability: String,
    pub points: String,
    pub stats: String,
    pub moves: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpponentTeamRow {
    pub team_id: String,
    pub owner: String,
    pub description: String,
    pub member_species_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WebUiRows {
    pub team_members: Vec<TeamMemberRow>,
    pub opponent_rows: Vec<OpponentTeamRow>,
    pub usage_rows: Vec<UsageRow>,
}

pub fn default_team_path() -> PathBuf {
    PathBuf::from("tests/fixtures/basic-team.txt")
}

pub fn repo_root_from_cwd() -> Result<PathBuf> {
    Ok(repo_root_from(&std::env::current_dir()?))
}

fn repo_root_from(start: &Path) -> PathBuf {
    for ancestor in start.ancestors() {
        if ancestor
            .join("poke_analysis-main/stats/pokedex.json")
            .exists()
        {
            return ancestor.to_path_buf();
        }
    }
    start.to_path_buf()
}

impl WorkbenchState {
    pub fn load_from_repo(root: &Path, team_path: &Path) -> Result<Self> {
        let dataset = Dataset::load_from_repo(root)?;
        let resolved_team_path = resolve_input_path(root, team_path);
        let team_text = fs::read_to_string(&resolved_team_path)
            .with_context(|| format!("failed to read {}", resolved_team_path.display()))?;
        Self::from_text(root, team_path, &team_text, &dataset)
    }

    pub fn from_text(
        root: &Path,
        team_path: &Path,
        team_text: &str,
        dataset: &Dataset,
    ) -> Result<Self> {
        let parse = parse_showdown_text(team_text, dataset)?;
        let validation = validate_team(&parse.configs);
        let analysis = analyze_team(&parse.configs, dataset);
        let recommendations = recommend_team_members(&parse.configs, dataset, 5);
        let opponents = build_opponent_library(dataset, 24);
        let matchup = opponents
            .first()
            .and_then(|opponent| analyze_matchup(&parse.configs, &opponent.configs, dataset));
        let damage = parse
            .configs
            .first()
            .zip(
                opponents
                    .first()
                    .and_then(|opponent| opponent.configs.first()),
            )
            .map(|(attacker, defender)| calculate_damage_pair(attacker, defender, dataset));
        let usage_detail = parse
            .configs
            .first()
            .and_then(|first| usage_detail(dataset, &first.species_id));
        let usage_rows = usage_rows(dataset, None).into_iter().take(24).collect();
        let output_tiers = calculate_output_tiers(&parse.configs, dataset);
        let records = records_response(&[], None);
        let status = status_line(root, team_path, &parse, &validation);
        Ok(Self {
            team_path: team_path.to_path_buf(),
            parse,
            validation,
            analysis,
            recommendations,
            matchup,
            damage,
            usage_detail,
            usage_rows,
            output_tiers,
            opponents,
            records,
            status,
        })
    }

    pub fn selected_opponent(&self, index: usize) -> Option<&OpponentTeamEntry> {
        self.opponents.get(index)
    }

    pub fn selected_opponent_configs(&self) -> &[Config] {
        self.selected_opponent_configs_at(0)
    }

    pub fn selected_opponent_configs_at(&self, index: usize) -> &[Config] {
        self.opponents
            .get(index)
            .map(|opponent| opponent.configs.as_slice())
            .unwrap_or(&[])
    }

    pub fn web_ui_rows(
        &self,
        _opponent_index: usize,
        _usage_index: usize,
        _offset: usize,
    ) -> WebUiRows {
        let team_members = self
            .parse
            .configs
            .iter()
            .take(6)
            .map(|config| TeamMemberRow {
                species_name: config.display_name.clone(),
                item: config.item.clone(),
                ability: config.ability.clone(),
                points: format_points_text(&config.champion_points),
                stats: format_stats_text(&config.stats),
                moves: config.move_names.iter().take(4).cloned().collect(),
            })
            .collect();
        let opponent_rows = self
            .opponents
            .iter()
            .take(24)
            .map(|opponent| OpponentTeamRow {
                team_id: opponent.team_id.clone(),
                owner: opponent.owner.clone(),
                description: opponent.description.clone(),
                member_species_names: opponent
                    .member_species_names
                    .iter()
                    .take(6)
                    .cloned()
                    .collect(),
            })
            .collect();
        let usage_rows = self.usage_rows.iter().take(24).cloned().collect();
        WebUiRows {
            team_members,
            opponent_rows,
            usage_rows,
        }
    }

    fn recalculate_dynamic(
        &mut self,
        dataset: &Dataset,
        opponent_index: usize,
        attacker_index: usize,
        defender_index: usize,
        usage_index: usize,
    ) {
        let opponent_configs = self.selected_opponent_configs_at(opponent_index).to_vec();
        self.matchup = analyze_matchup(&self.parse.configs, &opponent_configs, dataset);
        self.damage = self
            .parse
            .configs
            .get(attacker_index)
            .zip(opponent_configs.get(defender_index))
            .map(|(attacker, defender)| calculate_damage_pair(attacker, defender, dataset));
        self.usage_detail = self
            .parse
            .configs
            .get(usage_index)
            .and_then(|config| usage_detail(dataset, &config.species_id));
    }
}

pub fn format_points_text(points: &poke_type_core::schema::ChampionPoints) -> String {
    format!(
        "HP {} / Atk {} / Def {} / SpA {} / SpD {} / Spe {}",
        points.hp, points.atk, points.def, points.spa, points.spd, points.spe,
    )
}

pub fn format_stats_text(stats: &poke_type_core::schema::Stats) -> String {
    format!(
        "{}-{}-{}-{}-{}-{}",
        stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe,
    )
}

pub fn type_label(state: &GuiState, type_name: &str) -> String {
    state.zh_with_en(type_name)
}

pub fn recommendation_reason_label(state: &GuiState, reason: &str) -> String {
    if let Some(type_name) = reason.strip_prefix("resists-") {
        return format!("抵抗 {}", type_label(state, type_name));
    }
    if let Some(type_name) = reason.strip_prefix("covers-") {
        return format!("打点覆盖 {}", type_label(state, type_name));
    }
    role_label(reason).to_owned()
}

pub fn damage_status_label(text: &str) -> String {
    match text {
        "Unknown move." => "未知招式".into(),
        "It's a status move, it won't deal damage." => "变化招式，不造成伤害".into(),
        "No effect." => "无效".into(),
        "guaranteed OHKO" => "确定 OHKO".into(),
        "possible 2HKO" => "可能 2HKO".into(),
        "possible 3HKO" => "可能 3HKO".into(),
        "possible 4HKO" => "可能 4HKO".into(),
        _ => text.to_owned(),
    }
}

pub fn role_label(role: &str) -> &'static str {
    match role {
        "support" => "辅助",
        "mixed" => "双刀",
        "physical" => "物攻",
        "special" => "特攻",
        "fakeout" => "击掌奇袭",
        "tailwind" => "顺风",
        "trickroom" => "戏法空间",
        "speeddebuff" => "降速控制",
        "paralysiscontrol" => "麻痹控制",
        "redirection" => "掩护转火",
        "guard" => "防护",
        "wideguard" => "广域防守",
        "quickguard" => "快速防守",
        "helpinghand" => "帮助",
        "pivot" => "轮转",
        "disruption" => "干扰",
        "screens" => "双墙",
        "intimidate" => "威吓",
        "weathersetter" => "天气手",
        "weathersweeper" => "天气打手",
        "terrainsetter" => "场地手",
        "sweeper" => "清场手",
        "slowattacker" => "低速输出",
        "tank" => "耐久轴",
        "attacker" => "输出",
        "clearamulet" => "清净坠饰",
        "covertcloak" => "密探斗篷",
        "safetygoggles" => "防尘护目镜",
        "focussash" => "气势披带",
        _ => "观察",
    }
}

fn resolve_input_path(root: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() || path.exists() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

fn status_line(
    root: &Path,
    team_path: &Path,
    parse: &ParseResult,
    validation: &TeamValidation,
) -> String {
    let first_name = parse
        .configs
        .first()
        .map(|config| config.display_name.as_str())
        .unwrap_or("无队伍");
    format!(
        "{} · {} 配置 · {} 错误 · 首位 {}",
        root.join(team_path).display(),
        parse.configs.len(),
        validation.errors.len() + parse.errors.len(),
        first_name
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_fixture_workbench_state() {
        let root = Path::new("../..");
        let state =
            WorkbenchState::load_from_repo(root, Path::new("tests/fixtures/basic-team.txt"))
                .unwrap();
        assert_eq!(state.parse.configs.len(), 1);
        assert_eq!(state.validation.size, 1);
        assert_eq!(state.analysis.coverage.len(), 18);
        assert_eq!(state.recommendations.len(), 5);
        assert_eq!(state.matchup.as_ref().unwrap().board.len(), 6);
        assert_eq!(state.damage.as_ref().unwrap().left_moves.len(), 4);
        assert_eq!(state.usage_detail.as_ref().unwrap().species_id, "garchomp");
        assert!(!state.usage_rows.is_empty());
        assert_eq!(state.output_tiers.len(), 1);
        assert!(!state.opponents.is_empty());
        assert!(state.opponents.len() <= 24);
        assert_eq!(state.records.stats.totals.total, 0);
        assert!(state.status.contains("Garchomp"));
    }

    #[test]
    fn gui_state_starts_without_required_team_path() {
        let root = Path::new("../..");
        let state = GuiState::new(root).unwrap();
        assert!(state.input_text.is_empty());
        assert!(state.result.is_none());
        assert_eq!(state.active_view, ActiveView::Library);
        assert!(state.source_label.contains("剪贴板"));
    }

    #[test]
    fn gui_state_defaults_to_library_shell() {
        let root = Path::new("../..");
        let state = GuiState::new(root).unwrap();
        assert_eq!(state.active_view, ActiveView::Library);
        assert_eq!(state.team_sidebar_tab, TeamSidebarTab::Team);
        assert_eq!(state.analysis_tab, AnalysisTab::Coverage);
    }

    #[test]
    fn gui_state_uses_chinese_default_source_labels() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        assert_eq!(state.source_label, "剪贴板 / 示例 / 文件");
        state.analyze_current_text();
        assert_eq!(
            state.error.as_deref(),
            Some("请先粘贴或打开 Showdown 队伍文本。")
        );
        state.load_sample();
        assert_eq!(state.source_label, "示例队伍");
        state.clear();
        assert_eq!(state.source_label, "剪贴板 / 示例 / 文件");
    }

    #[test]
    fn gui_state_uses_pschina_translation_source() {
        let root = Path::new("../..");
        let state = GuiState::new(root).unwrap();
        assert_eq!(
            state.translator.source,
            "PSChina Server Translation SV-1.7.2.user.js"
        );
        assert_eq!(state.translate("Garchomp"), "烈咬陆鲨");
        assert_eq!(state.translate("Dragon Claw"), "龙爪");
        assert_eq!(state.zh_with_en("Life Orb"), "生命宝珠 / Life Orb");
    }

    #[test]
    fn gui_state_pastes_and_analyzes_showdown_text() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state.paste_and_analyze(include_str!("../../../tests/fixtures/basic-team.txt").to_owned());
        let result = state.result.as_ref().unwrap();
        assert_eq!(state.active_view, ActiveView::Analysis);
        assert_eq!(result.parse.configs.len(), 1);
        assert_eq!(result.damage.as_ref().unwrap().left_moves.len(), 4);
        assert!(state.error.is_none());
    }

    #[test]
    fn gui_state_selects_dynamic_matchup_damage_and_usage() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state.paste_and_analyze(include_str!("../../../tests/fixtures/basic-team.txt").to_owned());

        state.select_opponent(1);
        state.select_defender(2);
        state.select_usage(0);

        let result = state.result.as_ref().unwrap();
        assert_eq!(state.selected_opponent_index, 1);
        assert_eq!(state.selected_defender_index, 2);
        assert_eq!(state.selected_usage_index, 0);
        assert_eq!(state.active_view, ActiveView::Usage);
        assert_eq!(result.matchup.as_ref().unwrap().overview.opponent_count, 6);
        assert_eq!(
            result.damage.as_ref().unwrap().defender_speed,
            result.opponents[1].configs[2].stats.spe,
        );
        assert_eq!(result.usage_detail.as_ref().unwrap().species_id, "garchomp");
    }

    #[test]
    fn gui_state_clamps_defender_against_selected_opponent() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state.paste_and_analyze(include_str!("../../../tests/fixtures/basic-team.txt").to_owned());
        let result = state.result.as_mut().unwrap();
        result.opponents[0].configs.truncate(1);

        state.select_opponent(1);
        state.select_defender(5);

        assert_eq!(state.selected_opponent_index, 1);
        assert_eq!(state.selected_defender_index, 5);
    }

    #[test]
    fn gui_state_clear_returns_to_library() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state.paste_and_analyze(include_str!("../../../tests/fixtures/basic-team.txt").to_owned());
        state.clear();
        assert!(state.input_text.is_empty());
        assert!(state.result.is_none());
        assert_eq!(state.active_view, ActiveView::Library);
    }

    #[test]
    fn gui_state_loads_team_file_from_button_workflow() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state
            .load_team_path(Path::new("tests/fixtures/basic-team.txt"))
            .unwrap();
        assert_eq!(state.active_view, ActiveView::Analysis);
        assert_eq!(state.source_label, "tests/fixtures/basic-team.txt");
        assert!(state.input_text.contains("Garchomp"));
        assert!(state.result.is_some());
    }

    #[test]
    fn gui_state_exports_showdown_and_json_results() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state.paste_and_analyze(include_str!("../../../tests/fixtures/basic-team.txt").to_owned());
        let showdown = state.export_showdown_text().unwrap();
        let json = state.export_analysis_json().unwrap();
        assert!(showdown.contains("Garchomp"));
        assert!(json.contains("\"configs\""));
        assert!(json.contains("\"usageRows\""));

        let records_json = r#"[
          {
            "id": "r1",
            "teamId": "team-a",
            "teamLabel": "测试队伍",
            "ourLineup": ["Garchomp", "Incineroar", "Milotic", "Kingambit"],
            "ourLead": ["Garchomp", "Incineroar"],
            "opponentTeam": ["Incineroar", "Milotic", "Kingambit", "Sneasler", "Pelipper", "Farigiraf"],
            "opponentLineup": ["Incineroar", "Milotic", "Kingambit", "Sneasler"],
            "result": "win"
          }
        ]"#;
        state.import_records_text(records_json).unwrap();
        let result = state.result.as_ref().unwrap();
        assert_eq!(state.active_view, ActiveView::Analysis);
        assert_eq!(result.records.stats.totals.total, 1);
        assert_eq!(result.records.stats.totals.win, 1);
        assert!(json.contains("\"analysis\""));
        assert_eq!(state.notice.as_deref(), Some("已导入 1 条战绩。"));
        assert!(state.error.is_none());
        let json = state.export_analysis_json().unwrap();
        assert!(json.contains("\"selectedOpponentIndex\""));
    }

    #[test]
    fn gui_state_populates_every_gui_surface() {
        let root = Path::new("../..");
        let mut state = GuiState::new(root).unwrap();
        state.load_sample();
        let result = state.result.as_ref().unwrap();
        assert!(!result.parse.configs.is_empty());
        assert!(result.validation.size > 0);
        assert_eq!(result.analysis.coverage.len(), 18);
        assert!(!result.recommendations.is_empty());
        assert!(!result.matchup.as_ref().unwrap().board.is_empty());
        assert!(!result.damage.as_ref().unwrap().left_moves.is_empty());
        assert_eq!(result.usage_detail.as_ref().unwrap().species_id, "garchomp");
        assert!(!result.output_tiers.is_empty());
        assert!(!result.opponents.is_empty());
        assert_eq!(result.records.stats.totals.total, 0);
    }

    #[test]
    fn active_views_match_web_workspace_tabs() {
        let tabs = ActiveView::result_tabs();
        let labels = tabs.iter().map(|tab| tab.label).collect::<Vec<_>>();
        assert_eq!(
            labels,
            vec![
                "配置库",
                "队伍分析",
                "对局分析",
                "组队推荐",
                "使用率",
                "伤害工作台",
                "速度线",
                "输出强度",
            ]
        );
        assert_eq!(tabs[0].view, ActiveView::Library);
    }

    #[test]
    fn workbench_prepares_bounded_web_ui_rows() {
        let root = Path::new("../..");
        let state =
            WorkbenchState::load_from_repo(root, Path::new("tests/fixtures/basic-team.txt"))
                .unwrap();
        let rows = state.web_ui_rows(0, 0, 0);
        assert!(rows.team_members.len() <= 6);
        assert!(rows.opponent_rows.len() <= 24);
        assert!(rows.usage_rows.len() <= 24);
        assert!(!rows.team_members[0].moves.is_empty());
    }

    #[test]
    fn initial_workbench_bounds_heavy_ui_lists() {
        let root = Path::new("../..");
        let state =
            WorkbenchState::load_from_repo(root, Path::new("tests/fixtures/basic-team.txt"))
                .unwrap();
        assert!(state.opponents.len() <= 24);
        assert!(state.usage_rows.len() <= 24);
    }
}
