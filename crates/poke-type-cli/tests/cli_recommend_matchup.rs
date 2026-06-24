#[test]
fn recommend_outputs_ranked_entries() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["recommend", "--team", "tests/fixtures/basic-team.txt"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(!value.as_array().unwrap().is_empty());
    assert_ne!(value[0]["speciesId"], "garchomp");
}

#[test]
fn matchup_outputs_board() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args([
            "matchup",
            "--team",
            "tests/fixtures/basic-team.txt",
            "--opponent",
            "tests/fixtures/basic-team.txt",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["overview"]["allyCount"], 1);
    assert_eq!(value["board"].as_array().unwrap().len(), 1);
}

#[test]
fn vgcpastes_outputs_opponent_library() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["vgcpastes", "--limit", "3"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value.as_array().unwrap().len(), 3);
    assert!(!value[0]["teamId"].as_str().unwrap().is_empty());
}
