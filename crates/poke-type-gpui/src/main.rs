use std::{fs, path::PathBuf};

use gpui::{
    App, Application, Bounds, ClickEvent, ClipboardItem, Context, Div, IntoElement,
    PathPromptOptions, Render, Stateful, Window, WindowBounds, WindowOptions, div, prelude::*, px,
    rgb, size,
};
use poke_type_gpui::{
    ActiveView, AnalysisTab, GuiState, TeamSidebarTab, damage_status_label, format_points_text,
    format_stats_text, recommendation_reason_label, repo_root_from_cwd, role_label, type_label,
};

struct WorkbenchView {
    state: Result<GuiState, String>,
}

impl Render for WorkbenchView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match &self.state {
            Ok(state) => render_shell(state, cx).into_any_element(),
            Err(message) => render_boot_error(message).into_any_element(),
        }
    }
}

fn render_shell(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .id("poke-type-gui")
        .flex()
        .flex_col()
        .gap_3()
        .w(px(1280.0))
        .h(px(820.0))
        .p_4()
        .bg(surface())
        .text_color(text())
        .text_sm()
        .child(site_header(state, cx))
        .child(hero())
        .child(app_shell(state, cx))
        .child(site_footer())
        .child(toast_stack(state))
}

fn site_header(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap_4()
        .child(
            div()
                .flex()
                .items_center()
                .gap_3()
                .child(
                    div()
                        .px_2()
                        .py_1()
                        .rounded_md()
                        .bg(primary())
                        .text_color(primary_text())
                        .child("PT"),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_1()
                        .child(div().text_lg().child("Poke Type · Champions M-B"))
                        .child(div().text_color(muted()).child(format!(
                            "本地数据 · Rust/GPUI · 翻译源 {}",
                            state.translator.source
                        ))),
                ),
        )
        .child(
            div()
                .flex()
                .gap_2()
                .flex_wrap()
                .items_center()
                .child(utility_chip("中文"))
                .child(utility_chip("English"))
                .child(utility_chip("Showdown 图标"))
                .child(action_button(
                    "open",
                    "打开",
                    false,
                    cx.listener(open_team_file),
                ))
                .child(action_button(
                    "paste",
                    "粘贴分析",
                    true,
                    cx.listener(paste_from_clipboard),
                ))
                .child(action_button(
                    "sample",
                    "示例",
                    false,
                    cx.listener(load_sample),
                ))
                .child(action_button(
                    "records",
                    "导入战绩",
                    false,
                    cx.listener(open_records_file),
                ))
                .child(action_button(
                    "analyze",
                    "重新分析",
                    false,
                    cx.listener(analyze_current),
                ))
                .child(action_button(
                    "copy-json",
                    "复制 JSON",
                    false,
                    cx.listener(copy_analysis_json),
                ))
                .child(action_button(
                    "save-json",
                    "保存 JSON",
                    false,
                    cx.listener(save_analysis_json),
                ))
                .child(status_chip(state)),
        )
}

fn hero() -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap_1()
        .child(div().text_xl().child("宝可梦队伍组建分析"))
        .child(
            div()
                .text_color(muted())
                .child("粘贴 Showdown 配置，分析覆盖、推荐搭档、计算伤害。本地优先，零后端。"),
        )
}

fn app_shell(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .flex()
        .gap_3()
        .h_full()
        .child(team_sidebar(state, cx))
        .child(workspace(state, cx))
}

fn team_sidebar(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    panel_box("当前队伍", 350.0)
        .child(team_sidebar_header(state, cx))
        .child(team_sidebar_tabs(state, cx))
        .child(team_sidebar_body(state, cx))
}

fn team_sidebar_header(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap_2()
        .child(
            div()
                .flex()
                .justify_between()
                .items_center()
                .child(div().child("队伍在配置库、分析、推荐和速度线页面之间共享。"))
                .child(count_badge(&format!("{} / 6", team_count(state)))),
        )
        .child(
            div()
                .flex()
                .gap_2()
                .flex_wrap()
                .child(action_button(
                    "copy-team",
                    "复制队伍",
                    false,
                    cx.listener(copy_showdown),
                ))
                .child(action_button(
                    "save-team",
                    "保存为…",
                    false,
                    cx.listener(save_showdown),
                ))
                .child(action_button(
                    "clear",
                    "清空",
                    false,
                    cx.listener(clear_input),
                )),
        )
}

fn team_sidebar_tabs(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .flex()
        .gap_2()
        .child(sidebar_tab(
            "team-sidebar-tab-team",
            "队伍成员",
            TeamSidebarTab::Team,
            state,
            cx,
        ))
        .child(sidebar_tab(
            "team-sidebar-tab-saved",
            "存档",
            TeamSidebarTab::Saved,
            state,
            cx,
        ))
        .child(sidebar_tab(
            "team-sidebar-tab-import",
            "导入",
            TeamSidebarTab::Import,
            state,
            cx,
        ))
}

fn team_sidebar_body(state: &GuiState, _cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    match state.team_sidebar_tab {
        TeamSidebarTab::Team => team_member_list(state).into_any_element(),
        TeamSidebarTab::Saved => saved_team_panel().into_any_element(),
        TeamSidebarTab::Import => team_import_panel(state).into_any_element(),
    }
}

fn team_member_list(state: &GuiState) -> impl IntoElement {
    let mut view = stack_list();
    if let Some(result) = &state.result {
        for config in result.parse.configs.iter().take(6) {
            let moves = config
                .move_names
                .iter()
                .take(4)
                .map(|name| state.zh_with_en(name))
                .collect::<Vec<_>>()
                .join(" / ");
            view = view.child(
                compact_row(&state.zh_with_en(&config.display_name))
                    .child(div().text_color(muted()).child(format!(
                        "{} · {} · {} · Lv{}",
                        config
                            .types
                            .iter()
                            .map(|type_name| type_label(state, type_name))
                            .collect::<Vec<_>>()
                            .join("/"),
                        state.zh_with_en(&config.item),
                        state.zh_with_en(&config.ability),
                        config.level,
                    )))
                    .child(div().text_color(muted()).child(format!(
                        "{} · {}",
                        format_points_text(&config.champion_points),
                        format_stats_text(&config.stats),
                    )))
                    .child(div().child(moves)),
            );
        }
    } else {
        view = view.child(empty_note(
            "尚未导入队伍。打开文件、粘贴 Showdown 文本，或载入示例。",
        ));
    }
    view
}

fn saved_team_panel() -> impl IntoElement {
    stack_list()
        .child(compact_row("保存当前队伍").child("Rust 本地存档尚未启用；不会写入假存档。"))
        .child(compact_row("搜索已保存队伍").child("等待真实持久化后接入。"))
}

fn team_import_panel(state: &GuiState) -> impl IntoElement {
    stack_list()
        .child(
            compact_row("Showdown 导入")
                .child("直接粘贴或点击顶部“打开”。解析成功后会共享到配置库、分析、推荐和速度线。"),
        )
        .child(metric_pair(
            "文本",
            &format!("{} 字节", state.input_text.len()),
            "行数",
            &line_count(&state.input_text).to_string(),
        ))
        .child(compact_row("预览").child(preview_text(&state.input_text)))
}

fn workspace(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .flex_1()
        .h_full()
        .child(controls_panel(state, cx))
        .child(workspace_stack(state, cx))
}

fn controls_panel(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    panel_fill("导入与对手库")
        .child(
            div()
                .flex()
                .gap_2()
                .flex_wrap()
                .child(action_button(
                    "load-default-preset",
                    "载入默认预设",
                    false,
                    cx.listener(load_sample),
                ))
                .child(action_button(
                    "import-file",
                    "文件导入",
                    false,
                    cx.listener(open_team_file),
                ))
                .child(action_button(
                    "export-full-state",
                    "导出全部状态",
                    false,
                    cx.listener(copy_analysis_json),
                )),
        )
        .child(vgcpastes_picker(state))
        .child(status_notice(state))
}

fn vgcpastes_picker(state: &GuiState) -> impl IntoElement {
    let mut view = div().flex().gap_2().flex_wrap();
    if let Some(result) = &state.result {
        for team in result.opponents.iter().take(4) {
            view = view.child(utility_chip(&format!("{} · {}", team.team_id, team.owner)));
        }
    } else {
        view = view.child(utility_chip("载入队伍后显示 VGCPastes 样本"));
    }
    view
}

fn workspace_stack(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    panel_fill("工作区")
        .child(view_tabs(state, cx))
        .child(workspace_context_bar(state))
        .child(selected_view(state.active_view, state, cx).into_any_element())
}

fn view_tabs(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    let mut tabs = div().flex().flex_wrap().gap_2();
    for tab in ActiveView::result_tabs() {
        tabs = tabs.child(view_tab(tab.id, tab.label, tab.view, state, cx));
    }
    tabs
}

fn workspace_context_bar(state: &GuiState) -> impl IntoElement {
    if let Some(result) = &state.result {
        div()
            .bg(field_bg())
            .border_1()
            .border_color(rule())
            .rounded_md()
            .p_2()
            .child(format!(
                "{} 配置 · {} / 66 点 · {} 对手样本 · {} usage 行 · {}",
                result.parse.configs.len(),
                result.analysis.identity.points_total,
                result.opponents.len(),
                result.usage_rows.len(),
                result.status,
            ))
            .into_any_element()
    } else {
        div()
            .bg(field_bg())
            .border_1()
            .border_color(rule())
            .rounded_md()
            .p_2()
            .text_color(muted())
            .child("未分析队伍。首屏不渲染全量数据，载入队伍后按页显示。")
            .into_any_element()
    }
}

fn selected_view(
    view: ActiveView,
    state: &GuiState,
    cx: &mut Context<WorkbenchView>,
) -> impl IntoElement {
    let Some(result) = state.result.as_ref() else {
        return first_run_view(state).into_any_element();
    };
    match view {
        ActiveView::Library => library_view(state, result).into_any_element(),
        ActiveView::Analysis => analysis_view(state, result, cx).into_any_element(),
        ActiveView::Matchup => matchup_view(state, result, cx).into_any_element(),
        ActiveView::Recommendations => recommendations_view(state, result).into_any_element(),
        ActiveView::Usage => usage_view(state, result, cx).into_any_element(),
        ActiveView::Damage => damage_view(state, result, cx).into_any_element(),
        ActiveView::Speed => speed_view(state, result).into_any_element(),
        ActiveView::Output => output_view(state, result).into_any_element(),
    }
}

fn first_run_view(state: &GuiState) -> impl IntoElement {
    stack_list()
        .child(
            compact_row("从队伍文本开始")
                .child("无需启动参数。打开文件，粘贴 Showdown 文本，或载入示例队伍。"),
        )
        .child(
            compact_row("加载策略")
                .child("Rust/GPUI 首屏只画外壳；对局、使用率和伤害数据在分析后按视图渲染。"),
        )
        .child(compact_row("中文名称").child(format!(
            "宝可梦、招式、道具名来自 {}。",
            state.translator.source
        )))
}

fn library_view(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> impl IntoElement {
    let mut view = view_panel(
        "配置库",
        "搜索配置库 · 当前队伍优先，随后显示选中对手样本。",
    )
    .child(metric_pair(
        "当前队伍",
        &format!("{} 条", result.parse.configs.len()),
        "对手库",
        &format!("{} 队", result.opponents.len()),
    ));
    for config in result.parse.configs.iter().take(6) {
        view = view.child(
            compact_row(&state.zh_with_en(&config.display_name)).child(format!(
                "{} · {} · {}",
                state.zh_with_en(&config.item),
                state.zh_with_en(&config.ability),
                config
                    .move_names
                    .iter()
                    .take(4)
                    .map(|name| state.zh_with_en(name))
                    .collect::<Vec<_>>()
                    .join(" / "),
            )),
        );
    }
    for opponent in result.opponents.iter().take(6) {
        view = view.child(
            compact_row(&format!("{} · {}", opponent.team_id, opponent.owner)).child(
                opponent
                    .member_species_names
                    .iter()
                    .map(|name| state.zh_with_en(name))
                    .collect::<Vec<_>>()
                    .join(" / "),
            ),
        );
    }
    view
}

fn analysis_view(
    state: &GuiState,
    result: &poke_type_gpui::WorkbenchState,
    cx: &mut Context<WorkbenchView>,
) -> impl IntoElement {
    let mut view = view_panel("队伍分析", "分析基于队伍已选配置的属性、招式和速度数据。")
        .child(metric_pair(
            "规则",
            &result.analysis.field_state.format,
            "点数",
            &format!("{} / 66", result.analysis.identity.points_total),
        ))
        .child(metric_pair(
            "主要弱点",
            &format_top_type(state, &result.analysis.weaknesses),
            "进攻盲点",
            &format_top_type(state, &result.analysis.blind_spots),
        ))
        .child(analysis_tabs(state, cx));
    match state.analysis_tab {
        AnalysisTab::Coverage => {
            view = view
                .child(analysis_type_rows(
                    state,
                    "防守承压",
                    &result.analysis.defensive,
                    true,
                ))
                .child(analysis_type_rows(
                    state,
                    "进攻覆盖",
                    &result.analysis.offensive,
                    false,
                ))
                .child(coverage_rows(state, result));
        }
        AnalysisTab::Roles => {
            view = view
                .child(role_rows(state, result))
                .child(speed_rows(state, result));
        }
        AnalysisTab::Cores => {
            view = view.child(
                compact_row("核心结构")
                    .child("Rust core 暂未暴露旧网页 Cores 细分；当前保留位置，避免伪造结论。"),
            );
        }
    }
    view
}

fn recommendations_view(
    state: &GuiState,
    result: &poke_type_gpui::WorkbenchState,
) -> impl IntoElement {
    let mut view = view_panel(
        "组队推荐",
        "推荐候选按防守缺口、进攻盲点、使用率和现有队友去重。",
    );
    for entry in result.recommendations.iter().take(12) {
        let reasons = entry
            .reasons
            .iter()
            .map(|reason| recommendation_reason_label(state, reason))
            .collect::<Vec<_>>()
            .join("，");
        view = view.child(
            compact_row(&state.zh_with_en(&entry.species_name)).child(format!(
                "分数 {:.1} · 使用率 {:.1}% · {}",
                entry.score, entry.usage, reasons,
            )),
        );
    }
    if result.recommendations.is_empty() {
        view = view.child(empty_note("当前队伍已满或没有可推荐候选。"));
    }
    view
}

fn damage_view(
    state: &GuiState,
    result: &poke_type_gpui::WorkbenchState,
    cx: &mut Context<WorkbenchView>,
) -> impl IntoElement {
    let mut controls = subpanel("伤害控制");
    controls = controls.child(section_title("我方攻击方"));
    for (index, config) in result.parse.configs.iter().enumerate().take(6) {
        controls = controls.child(index_button(
            ("attacker", index),
            &state.zh_with_en(&config.display_name),
            state.selected_attacker_index == index,
            cx.listener(move |this, _, _, cx| {
                if let Ok(state) = &mut this.state {
                    state.select_attacker(index);
                }
                cx.notify();
            }),
        ));
    }
    controls = controls.child(section_title("对手防守方"));
    if let Some(opponent) = result.selected_opponent(state.selected_opponent_index) {
        for (index, config) in opponent.configs.iter().enumerate().take(6) {
            controls = controls.child(index_button(
                ("defender", index),
                &state.zh_with_en(&config.display_name),
                state.selected_defender_index == index,
                cx.listener(move |this, _, _, cx| {
                    if let Ok(state) = &mut this.state {
                        state.select_defender(index);
                    }
                    cx.notify();
                }),
            ));
        }
    }

    let field = subpanel("场地")
        .child(metric_pair(
            "对手队伍",
            &selected_opponent_label(state, result),
            "选择",
            &format!(
                "{} → {}",
                state.selected_attacker_index + 1,
                state.selected_defender_index + 1
            ),
        ))
        .child(compact_row("假设").child("Champions 规则，双打扩散招式按核心伤害逻辑折算。"));

    let mut summary = subpanel("伤害摘要");
    if let Some(damage) = &result.damage {
        summary = summary.child(metric_pair(
            "速度",
            &format!("{} vs {}", damage.attacker_speed, damage.defender_speed),
            "最优摘要",
            &localize_damage_headline(state, &damage.left_headline),
        ));
        for move_damage in damage.left_moves.iter().take(4) {
            summary = summary.child(
                compact_row(&state.zh_with_en(&move_damage.move_name)).child(format!(
                    "{} · {} · {:.1}%–{:.1}% · {}",
                    move_damage.damage_text,
                    damage_status_label(&move_damage.ko_text),
                    move_damage.min_percent,
                    move_damage.max_percent,
                    localize_damage_description(state, &move_damage.description),
                )),
            );
        }
        if !damage.right_moves.is_empty() {
            summary = summary.child(section_title("反向伤害"));
            for move_damage in damage.right_moves.iter().take(4) {
                summary = summary.child(
                    compact_row(&state.zh_with_en(&move_damage.move_name)).child(format!(
                        "{} · {} · {:.1}%–{:.1}%",
                        move_damage.damage_text,
                        damage_status_label(&move_damage.ko_text),
                        move_damage.min_percent,
                        move_damage.max_percent,
                    )),
                );
            }
        }
    } else {
        summary = summary.child(empty_note("需要我方和对手配置才能生成伤害行。"));
    }

    div()
        .flex()
        .gap_2()
        .child(div().flex_1().child(controls))
        .child(div().flex_1().child(field))
        .child(div().flex_1().child(summary))
}

fn matchup_view(
    state: &GuiState,
    result: &poke_type_gpui::WorkbenchState,
    cx: &mut Context<WorkbenchView>,
) -> impl IntoElement {
    let mut opponent_panel = subpanel("对面队伍").child(
        compact_row("VGCPastes 样本")
            .child("从本地 paste_teams_champions_mb.json 读取，点击样本切换对局与伤害目标。"),
    );
    for (index, opponent) in result.opponents.iter().enumerate().take(8) {
        opponent_panel = opponent_panel.child(index_button(
            ("opponent", index),
            &format!("{} · {}", opponent.team_id, opponent.owner),
            state.selected_opponent_index == index,
            cx.listener(move |this, _, _, cx| {
                if let Ok(state) = &mut this.state {
                    state.select_opponent(index);
                }
                cx.notify();
            }),
        ));
    }

    let quick_pick = subpanel("快速选择")
        .child(compact_row("当前对手").child(selected_opponent_label(state, result)))
        .child(compact_row("保存对面队伍").child("可视位置保留；真实存档未启用前不写假数据。"));

    let mut analysis = subpanel("对局分析");
    if let Some(matchup) = &result.matchup {
        analysis = analysis
            .child(metric_pair(
                "格子",
                &format!("{} 个", matchup.board.len()),
                "速度线",
                &format!("{} 条", matchup.speed_lines.len()),
            ))
            .child(metric_pair(
                "优势",
                &matchup.overview.favorable_cells.to_string(),
                "危险",
                &matchup.overview.danger_cells.to_string(),
            ));
        for cell in matchup.board.iter().take(12) {
            analysis = analysis.child(
                compact_row(&format!(
                    "{} → {}",
                    species_label_by_id(state, &cell.ally_species_id),
                    species_label_by_id(state, &cell.opponent_species_id),
                ))
                .child(format!(
                    "命中 {:.1}x · 承伤 {:.1}x · 先手差 {} · {}",
                    cell.best_multiplier,
                    cell.incoming_multiplier,
                    cell.initiative,
                    matchup_rating_label(&cell.rating),
                )),
            );
        }
    } else {
        analysis = analysis.child(empty_note("需要我方和对手队伍才能生成对局面板。"));
    }

    div()
        .flex()
        .gap_2()
        .child(div().flex_1().child(opponent_panel))
        .child(div().flex_1().child(quick_pick))
        .child(div().flex_1().child(analysis))
}

fn usage_view(
    state: &GuiState,
    result: &poke_type_gpui::WorkbenchState,
    cx: &mut Context<WorkbenchView>,
) -> impl IntoElement {
    let mut view = view_panel(
        "使用率",
        "查看当前 Champions 规则对应的 usage；缺数据时显式展示空状态。",
    )
    .child(metric_line(
        "数据源",
        &format!("{} 条候选", result.usage_rows.len()),
    ));
    let mut selector = div().flex().gap_2().flex_wrap();
    for (index, config) in result.parse.configs.iter().enumerate().take(6) {
        selector = selector.child(index_button(
            ("usage", index),
            &state.zh_with_en(&config.display_name),
            state.selected_usage_index == index,
            cx.listener(move |this, _, _, cx| {
                if let Ok(state) = &mut this.state {
                    state.select_usage(index);
                }
                cx.notify();
            }),
        ));
    }
    view = view.child(selector);
    if let Some(usage) = &result.usage_detail {
        view = view
            .child(metric_pair(
                "当前物种",
                &state.zh_with_en(&usage.species_name),
                "排名",
                &usage.rank.to_string(),
            ))
            .child(metric_line(
                "使用率",
                &format!("{:.1}% · sample {:.0}", usage.usage, usage.sample_weight),
            ))
            .child(metric_line(
                "常用招式",
                &format_record_entries(state, &usage.moves),
            ))
            .child(metric_line(
                "常用道具",
                &format_record_entries(state, &usage.items),
            ))
            .child(metric_line(
                "常用特性",
                &format_record_entries(state, &usage.abilities),
            ))
            .child(metric_line(
                "常见队友",
                &format_record_entries(state, &usage.teammates),
            ));
    }
    view = view.child(section_title("Top 使用率"));
    for row in result.usage_rows.iter().take(12) {
        view = view.child(
            compact_row(&state.zh_with_en(&row.species_name)).child(format!(
                "#{} · {:.1}% · {}",
                row.rank, row.usage, row.source
            )),
        );
    }
    view
}

fn speed_view(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> impl IntoElement {
    let mut view = view_panel("常见速度线", "队伍速度层与当前对局速度线分开显示。")
        .child(speed_rows(state, result));
    if let Some(matchup) = &result.matchup {
        view = view.child(section_title("当前对局速度线"));
        for line in matchup.speed_lines.iter().take(12) {
            view = view.child(
                compact_row(&species_label_by_id(state, &line.species_id)).child(format!(
                    "{} · Spe {}",
                    side_label(&line.side),
                    line.speed
                )),
            );
        }
    }
    view
}

fn output_view(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> impl IntoElement {
    let mut view = view_panel(
        "输出强度",
        "按配置库已配置招式的输出上限与稳定输出整理火力参考线。",
    )
    .child(metric_line("分层", &output_summary(result)));
    for tier in &result.output_tiers {
        view = view.child(section_title(&format!(
            "{} 分 · {} 项",
            tier.score, tier.total_count
        )));
        for entry in tier.entries.iter().take(12) {
            view = view.child(
                compact_row(&state.zh_with_en(&entry.display_name)).child(format!(
                    "峰值 {} {:.1} · 稳定 {} {:.1}",
                    state.zh_with_en(&entry.peak_move_name),
                    entry.peak_score,
                    state.zh_with_en(&entry.stable_move_name),
                    entry.stable_score,
                )),
            );
        }
    }
    if result.output_tiers.is_empty() {
        view = view.child(empty_note("当前配置没有可评分输出招式。"));
    }
    view
}

fn site_footer() -> impl IntoElement {
    div()
        .flex()
        .justify_between()
        .text_color(muted())
        .child("本地优先 · 无后端 · 不收集任何数据。")
        .child("Champions M-B · 66 pt")
}

fn toast_stack(state: &GuiState) -> impl IntoElement {
    if let Some(notice) = &state.notice {
        div()
            .bg(notice_bg())
            .border_1()
            .border_color(notice_rule())
            .rounded_md()
            .p_2()
            .child(notice.clone())
            .into_any_element()
    } else {
        div().into_any_element()
    }
}

fn render_boot_error(message: &str) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .w(px(900.0))
        .h(px(520.0))
        .p_4()
        .bg(surface())
        .text_color(error_text())
        .child("Poke Type 启动失败")
        .child(message.to_owned())
}

fn action_button(
    id: &'static str,
    label: &'static str,
    primary_button: bool,
    listener: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> Stateful<Div> {
    div()
        .id(id)
        .px_3()
        .py_1()
        .bg(if primary_button {
            primary()
        } else {
            field_bg()
        })
        .text_color(if primary_button {
            primary_text()
        } else {
            text()
        })
        .border_1()
        .border_color(if primary_button { primary() } else { rule() })
        .rounded_md()
        .cursor_pointer()
        .hover(move |this| {
            this.bg(if primary_button {
                primary_hover()
            } else {
                hover_bg()
            })
        })
        .child(label)
        .on_click(listener)
}

fn view_tab(
    id: &'static str,
    label: &'static str,
    view: ActiveView,
    state: &GuiState,
    cx: &mut Context<WorkbenchView>,
) -> Stateful<Div> {
    let selected = state.active_view == view;
    div()
        .id(id)
        .px_3()
        .py_1()
        .bg(if selected { primary_soft() } else { field_bg() })
        .text_color(if selected { primary() } else { text() })
        .border_1()
        .border_color(if selected { primary() } else { rule() })
        .rounded_md()
        .cursor_pointer()
        .hover(move |this| this.bg(if selected { primary_soft() } else { hover_bg() }))
        .child(label)
        .on_click(cx.listener(move |this, _, _, cx| {
            if let Ok(state) = &mut this.state {
                state.select_view(view);
            }
            cx.notify();
        }))
}

fn sidebar_tab(
    id: &'static str,
    label: &'static str,
    tab: TeamSidebarTab,
    state: &GuiState,
    cx: &mut Context<WorkbenchView>,
) -> Stateful<Div> {
    let selected = state.team_sidebar_tab == tab;
    div()
        .id(id)
        .px_3()
        .py_1()
        .bg(if selected { primary_soft() } else { field_bg() })
        .text_color(if selected { primary() } else { text() })
        .border_1()
        .border_color(if selected { primary() } else { rule() })
        .rounded_md()
        .cursor_pointer()
        .child(label)
        .on_click(cx.listener(move |this, _, _, cx| {
            if let Ok(state) = &mut this.state {
                state.select_team_sidebar_tab(tab);
            }
            cx.notify();
        }))
}

fn analysis_tabs(state: &GuiState, cx: &mut Context<WorkbenchView>) -> impl IntoElement {
    div()
        .flex()
        .gap_2()
        .child(analysis_tab_button(
            ("analysis-tab", 0),
            "Coverage",
            AnalysisTab::Coverage,
            state,
            cx,
        ))
        .child(analysis_tab_button(
            ("analysis-tab", 1),
            "Roles",
            AnalysisTab::Roles,
            state,
            cx,
        ))
        .child(analysis_tab_button(
            ("analysis-tab", 2),
            "Cores",
            AnalysisTab::Cores,
            state,
            cx,
        ))
}

fn analysis_tab_button(
    id: (&'static str, usize),
    label: &'static str,
    tab: AnalysisTab,
    state: &GuiState,
    cx: &mut Context<WorkbenchView>,
) -> Stateful<Div> {
    let selected = state.analysis_tab == tab;
    div()
        .id(id)
        .px_3()
        .py_1()
        .bg(if selected { primary_soft() } else { field_bg() })
        .text_color(if selected { primary() } else { text() })
        .border_1()
        .border_color(if selected { primary() } else { rule() })
        .rounded_md()
        .cursor_pointer()
        .child(label)
        .on_click(cx.listener(move |this, _, _, cx| {
            if let Ok(state) = &mut this.state {
                state.select_analysis_tab(tab);
            }
            cx.notify();
        }))
}

fn index_button(
    id: (&'static str, usize),
    label: &str,
    selected: bool,
    listener: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> Stateful<Div> {
    div()
        .id(id)
        .px_2()
        .py_1()
        .bg(if selected { primary_soft() } else { field_bg() })
        .text_color(if selected { primary() } else { text() })
        .border_1()
        .border_color(if selected { primary() } else { rule() })
        .rounded_md()
        .cursor_pointer()
        .child(label.to_owned())
        .on_click(listener)
}

fn panel_box(title: &'static str, width: f32) -> Div {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .w(px(width))
        .h_full()
        .bg(panel_bg())
        .border_1()
        .border_color(rule())
        .rounded_md()
        .p_3()
        .text_color(text())
        .child(section_head(title, ""))
}

fn panel_fill(title: &'static str) -> Div {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .w_full()
        .bg(panel_bg())
        .border_1()
        .border_color(rule())
        .rounded_md()
        .p_3()
        .text_color(text())
        .child(section_head(title, ""))
}

fn view_panel(title: &str, copy: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .child(section_head(title, copy))
}

fn subpanel(title: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .gap_2()
        .bg(field_bg())
        .border_1()
        .border_color(rule())
        .rounded_md()
        .p_3()
        .child(section_title(title))
}

fn section_head(title: &str, copy: &str) -> impl IntoElement {
    let mut view = div().flex().flex_col().gap_1().child(section_title(title));
    if !copy.is_empty() {
        view = view.child(div().text_color(muted()).child(copy.to_owned()));
    }
    view
}

fn section_title(title: &str) -> impl IntoElement {
    div().text_color(text()).child(title.to_owned())
}

fn stack_list() -> Div {
    div().flex().flex_col().gap_2()
}

fn compact_row(label: &str) -> Div {
    div()
        .flex()
        .flex_col()
        .gap_1()
        .bg(field_bg())
        .border_1()
        .border_color(rule())
        .rounded_md()
        .p_2()
        .child(div().text_color(text()).child(label.to_owned()))
}

fn empty_note(text_value: &str) -> impl IntoElement {
    div()
        .bg(field_bg())
        .border_1()
        .border_color(rule())
        .rounded_md()
        .p_2()
        .text_color(muted())
        .child(text_value.to_owned())
}

fn metric_line(label: &str, value: &str) -> impl IntoElement {
    compact_row(label).child(value.to_owned())
}

fn metric_pair(label_a: &str, value_a: &str, label_b: &str, value_b: &str) -> impl IntoElement {
    div()
        .flex()
        .gap_2()
        .child(div().flex_1().child(metric_line(label_a, value_a)))
        .child(div().flex_1().child(metric_line(label_b, value_b)))
}

fn count_badge(label: &str) -> impl IntoElement {
    div()
        .px_2()
        .py_1()
        .rounded_md()
        .bg(primary_soft())
        .border_1()
        .border_color(primary())
        .text_color(primary())
        .child(label.to_owned())
}

fn utility_chip(label: impl ToString) -> Div {
    div()
        .px_2()
        .py_1()
        .rounded_md()
        .bg(field_bg())
        .border_1()
        .border_color(rule())
        .text_color(muted())
        .child(label.to_string())
}

fn analysis_type_rows(
    state: &GuiState,
    title: &str,
    entries: &[poke_type_core::analysis::TypeMatchupEntry],
    high_is_bad: bool,
) -> impl IntoElement {
    let mut view = stack_list().child(section_title(title));
    for entry in entries.iter().take(8) {
        let marker = if high_is_bad && entry.score > 1.0 {
            "承压"
        } else if !high_is_bad && entry.score >= 2.0 {
            "覆盖"
        } else {
            "观察"
        };
        view = view.child(
            compact_row(&type_label(state, &entry.type_name)).child(format!(
                "{marker} · score {:.2} · count {}",
                entry.score, entry.count
            )),
        );
    }
    view
}

fn coverage_rows(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> impl IntoElement {
    let mut view = stack_list().child(section_title("属性覆盖"));
    for entry in result.analysis.coverage.iter().take(8) {
        let attackers = entry
            .attackers
            .iter()
            .map(|name| state.zh_with_en(name))
            .collect::<Vec<_>>()
            .join("，");
        view = view.child(
            compact_row(&type_label(state, &entry.type_name)).child(format!(
                "最佳 {:.1}x · {}",
                entry.best_multiplier, attackers
            )),
        );
    }
    view
}

fn role_rows(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> impl IntoElement {
    let mut view = stack_list().child(section_title("角色识别"));
    for entry in &result.analysis.roles {
        let utility = entry
            .roles
            .utility_roles
            .iter()
            .map(|role| role_label(role))
            .collect::<Vec<_>>()
            .join(" / ");
        let structure = entry
            .roles
            .structure_roles
            .iter()
            .map(|role| role_label(role))
            .collect::<Vec<_>>()
            .join(" / ");
        view = view.child(
            compact_row(&state.zh_with_en(&entry.display_name)).child(format!(
                "{} · {} · {}",
                role_label(&entry.roles.attack_bias),
                utility,
                structure
            )),
        );
    }
    view
}

fn speed_rows(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> impl IntoElement {
    let mut view = stack_list().child(section_title("队伍速度线"));
    for tier in &result.analysis.speed {
        let names = tier
            .entries
            .iter()
            .map(|entry| state.zh_with_en(&entry.display_name))
            .collect::<Vec<_>>()
            .join("，");
        view = view.child(compact_row(&format!("Spe {}", tier.speed)).child(names));
    }
    view
}

fn species_label_by_id(state: &GuiState, species_id: &str) -> String {
    state
        .dataset
        .pokedex
        .get(species_id)
        .and_then(|entry| entry.get("name"))
        .and_then(serde_json::Value::as_str)
        .map(|name| state.zh_with_en(name))
        .unwrap_or_else(|| state.zh_with_en(species_id))
}

fn matchup_rating_label(rating: &str) -> &'static str {
    match rating {
        "favorable" => "优势",
        "danger" => "危险",
        "even" => "均势",
        _ => "观察",
    }
}

fn side_label(side: &str) -> &'static str {
    match side {
        "ally" => "我方",
        "opponent" => "对手",
        _ => "未知",
    }
}

fn format_record_entries(
    state: &GuiState,
    records: &[poke_type_core::usage::RecordEntry],
) -> String {
    let text = records
        .iter()
        .take(5)
        .map(|record| {
            format!(
                "{} {:.1}%",
                state.zh_with_en(&record.resolved_name),
                record.share
            )
        })
        .collect::<Vec<_>>()
        .join("，");
    if text.is_empty() { "无".into() } else { text }
}

fn status_chip(state: &GuiState) -> impl IntoElement {
    let text = state
        .result
        .as_ref()
        .map(|result| {
            format!(
                "就绪 · {} 配置 · {}",
                result.parse.configs.len(),
                state.source_label
            )
        })
        .unwrap_or_else(|| "待输入 · 打开 / 粘贴 / 示例".into());
    utility_chip(text)
}

fn status_notice(state: &GuiState) -> impl IntoElement {
    if let Some(error) = &state.error {
        div()
            .bg(error_bg())
            .border_1()
            .border_color(error_rule())
            .rounded_md()
            .p_2()
            .text_color(error_text())
            .child(error.clone())
            .into_any_element()
    } else if let Some(notice) = &state.notice {
        div()
            .bg(notice_bg())
            .border_1()
            .border_color(notice_rule())
            .rounded_md()
            .p_2()
            .child(notice.clone())
            .into_any_element()
    } else {
        div()
            .text_color(muted())
            .child("解析状态正常。")
            .into_any_element()
    }
}

fn open_team_file(
    _this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    let receiver = cx.prompt_for_paths(PathPromptOptions {
        files: true,
        directories: false,
        multiple: false,
        prompt: Some("打开 Showdown 队伍".into()),
    });
    cx.spawn(async move |view, cx| match receiver.await {
        Ok(Ok(Some(paths))) => {
            if let Some(path) = paths.first() {
                let path = path.clone();
                let _ = view.update(cx, move |this, cx| {
                    if let Ok(state) = &mut this.state {
                        if let Err(error) = state.load_team_path(&path) {
                            state.error = Some(format!("{error:#}"));
                            state.active_view = ActiveView::Library;
                        }
                    }
                    cx.notify();
                });
            }
        }
        Ok(Ok(None)) => {}
        Ok(Err(error)) => {
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    state.error = Some(format!("{error:#}"));
                    state.active_view = ActiveView::Library;
                }
                cx.notify();
            });
        }
        Err(error) => {
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    state.error = Some(format!("文件对话框失败：{error}"));
                    state.active_view = ActiveView::Library;
                }
                cx.notify();
            });
        }
    })
    .detach();
}

fn open_records_file(
    _this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    let receiver = cx.prompt_for_paths(PathPromptOptions {
        files: true,
        directories: false,
        multiple: false,
        prompt: Some("导入 BattleRecord JSON".into()),
    });
    cx.spawn(async move |view, cx| match receiver.await {
        Ok(Ok(Some(paths))) => {
            if let Some(path) = paths.first() {
                let path = path.clone();
                let _ = view.update(cx, move |this, cx| {
                    if let Ok(state) = &mut this.state {
                        if let Err(error) = state.load_records_path(&path) {
                            state.error = Some(format!("导入战绩失败：{error:#}"));
                            state.notice = None;
                        }
                    }
                    cx.notify();
                });
            }
        }
        Ok(Ok(None)) => {}
        Ok(Err(error)) => {
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    state.error = Some(format!("战绩文件对话框失败：{error:#}"));
                    state.notice = None;
                }
                cx.notify();
            });
        }
        Err(error) => {
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    state.error = Some(format!("战绩文件对话框通道失败：{error}"));
                    state.notice = None;
                }
                cx.notify();
            });
        }
    })
    .detach();
}

fn paste_from_clipboard(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
            state.paste_and_analyze(text);
        } else {
            state.error = Some("剪贴板没有文本。".into());
            state.notice = None;
            state.active_view = ActiveView::Library;
        }
    }
    cx.notify();
}

fn load_sample(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        state.load_sample();
    }
    cx.notify();
}

fn analyze_current(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        state.analyze_current_text();
    }
    cx.notify();
}

fn clear_input(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        state.clear();
    }
    cx.notify();
}

fn copy_showdown(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        if let Some(text) = state.export_showdown_text() {
            cx.write_to_clipboard(ClipboardItem::new_string(text));
            state.error = None;
            state.notice = Some("已复制队伍。".into());
        } else {
            state.error = Some("请先分析队伍再导出。".into());
            state.notice = None;
        }
    }
    cx.notify();
}

fn copy_analysis_json(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        if let Some(text) = state.export_analysis_json() {
            cx.write_to_clipboard(ClipboardItem::new_string(text));
            state.error = None;
            state.notice = Some("已复制 JSON。".into());
        } else {
            state.error = Some("请先分析队伍再导出 JSON。".into());
            state.notice = None;
        }
    }
    cx.notify();
}

fn save_showdown(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        let Some(text) = state.export_showdown_text() else {
            state.error = Some("请先分析队伍再保存。".into());
            state.notice = None;
            cx.notify();
            return;
        };
        save_text_with_dialog(text, "poke-type-team.txt", cx);
    }
}

fn save_analysis_json(
    this: &mut WorkbenchView,
    _: &ClickEvent,
    _: &mut Window,
    cx: &mut Context<WorkbenchView>,
) {
    if let Ok(state) = &mut this.state {
        let Some(text) = state.export_analysis_json() else {
            state.error = Some("请先分析队伍再保存 JSON。".into());
            state.notice = None;
            cx.notify();
            return;
        };
        save_text_with_dialog(text, "poke-type-analysis.json", cx);
    }
}

fn save_text_with_dialog(
    text_value: String,
    suggested_name: &'static str,
    cx: &mut Context<WorkbenchView>,
) {
    let directory = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let receiver = cx.prompt_for_new_path(&directory, Some(suggested_name));
    cx.spawn(async move |view, cx| match receiver.await {
        Ok(Ok(Some(path))) => {
            let result = fs::write(&path, text_value);
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    match result {
                        Ok(()) => {
                            state.error = None;
                            state.notice = Some(format!("已保存 {}", path.display()));
                        }
                        Err(error) => {
                            state.error = Some(format!("保存 {} 失败：{error}", path.display()));
                            state.notice = None;
                        }
                    }
                }
                cx.notify();
            });
        }
        Ok(Ok(None)) => {}
        Ok(Err(error)) => {
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    state.error = Some(format!("保存对话框失败：{error:#}"));
                    state.notice = None;
                }
                cx.notify();
            });
        }
        Err(error) => {
            let _ = view.update(cx, move |this, cx| {
                if let Ok(state) = &mut this.state {
                    state.error = Some(format!("保存对话框通道失败：{error}"));
                    state.notice = None;
                }
                cx.notify();
            });
        }
    })
    .detach();
}

fn team_count(state: &GuiState) -> usize {
    state
        .result
        .as_ref()
        .map(|result| result.parse.configs.len())
        .unwrap_or(0)
}

fn selected_opponent_label(state: &GuiState, result: &poke_type_gpui::WorkbenchState) -> String {
    result
        .selected_opponent(state.selected_opponent_index)
        .map(|opponent| {
            format!(
                "{} · {} · {}",
                opponent.team_id, opponent.owner, opponent.description
            )
        })
        .unwrap_or_else(|| "未选择对手".into())
}

fn localize_damage_description(state: &GuiState, description: &str) -> String {
    state.zh_with_en(description)
}

fn localize_damage_headline(state: &GuiState, headline: &str) -> String {
    state.zh_with_en(headline)
}

fn format_top_type(
    state: &GuiState,
    entries: &[poke_type_core::analysis::TypeMatchupEntry],
) -> String {
    entries
        .first()
        .map(|entry| {
            format!(
                "{} · {:.2}",
                type_label(state, &entry.type_name),
                entry.score
            )
        })
        .unwrap_or_else(|| "无".into())
}

fn preview_text(text_value: &str) -> String {
    if text_value.is_empty() {
        "粘贴或打开队伍后，这里会显示前 10 行。".into()
    } else {
        text_value.lines().take(10).collect::<Vec<_>>().join("\n")
    }
}

fn line_count(text_value: &str) -> usize {
    if text_value.is_empty() {
        0
    } else {
        text_value.lines().count()
    }
}

fn output_summary(result: &poke_type_gpui::WorkbenchState) -> String {
    result
        .output_tiers
        .first()
        .map(|tier| format!("最高 {} · {} 项", tier.score, tier.total_count))
        .unwrap_or_else(|| "无".into())
}

fn surface() -> gpui::Hsla {
    rgb(0xf5f7fa).into()
}
fn panel_bg() -> gpui::Hsla {
    rgb(0xfffffe).into()
}
fn field_bg() -> gpui::Hsla {
    rgb(0xeef3f6).into()
}
fn hover_bg() -> gpui::Hsla {
    rgb(0xe5edf3).into()
}
fn rule() -> gpui::Hsla {
    rgb(0xd6e0e8).into()
}
fn text() -> gpui::Hsla {
    rgb(0x13202b).into()
}
fn muted() -> gpui::Hsla {
    rgb(0x536474).into()
}
fn primary() -> gpui::Hsla {
    rgb(0x174a73).into()
}
fn primary_hover() -> gpui::Hsla {
    rgb(0x123a5a).into()
}
fn primary_soft() -> gpui::Hsla {
    rgb(0xdcebf7).into()
}
fn primary_text() -> gpui::Hsla {
    rgb(0xf5f7fa).into()
}
fn notice_bg() -> gpui::Hsla {
    rgb(0xdcefe8).into()
}
fn notice_rule() -> gpui::Hsla {
    rgb(0x0b6b57).into()
}
fn error_bg() -> gpui::Hsla {
    rgb(0xf7dedb).into()
}
fn error_rule() -> gpui::Hsla {
    rgb(0xb42318).into()
}
fn error_text() -> gpui::Hsla {
    rgb(0xb42318).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn localizes_dynamic_core_labels() {
        let state = GuiState::new(Path::new("../..")).unwrap();
        assert_eq!(type_label(&state, "Dragon"), "龙 / Dragon");
        assert_eq!(
            recommendation_reason_label(&state, "resists-Dragon"),
            "抵抗 龙 / Dragon"
        );
        assert_eq!(
            recommendation_reason_label(&state, "covers-Steel"),
            "打点覆盖 钢 / Steel"
        );
        assert_eq!(
            damage_status_label("It's a status move, it won't deal damage."),
            "变化招式，不造成伤害"
        );
        assert_eq!(role_label("speeddebuff"), "降速控制");
    }
}

fn main() {
    Application::new().run(move |cx: &mut App| {
        let root = repo_root_from_cwd().unwrap_or_else(|_| PathBuf::from("."));
        let state = GuiState::new(&root).map_err(|error| format!("{error:#}"));
        let bounds = Bounds::centered(None, size(px(1280.0), px(820.0)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_, cx| cx.new(|_| WorkbenchView { state }),
        )
        .unwrap();
        cx.activate(true);
    });
}
