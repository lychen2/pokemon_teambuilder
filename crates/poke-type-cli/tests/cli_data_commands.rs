#[test]
fn usage_species_outputs_detail() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["usage", "--species", "garchomp"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["speciesId"], "garchomp");
    assert!(!value["moves"].as_array().unwrap().is_empty());
}

#[test]
fn output_library_returns_tiers() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["output", "--library", "tests/fixtures/basic-team.txt"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(!value.as_array().unwrap().is_empty());
    assert_eq!(value[0]["entries"][0]["speciesId"], "garchomp");
}

#[test]
fn records_without_file_outputs_empty_stats() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .arg("records")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["stats"]["scope"], "global");
    assert_eq!(value["stats"]["totals"]["total"], 0);
}
