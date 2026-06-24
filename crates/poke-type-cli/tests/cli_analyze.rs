#[test]
fn analyze_team_outputs_profiles() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["analyze", "--team", "tests/fixtures/basic-team.txt"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["fieldState"]["format"], "champions-vgc");
    assert_eq!(value["speed"].as_array().unwrap().len(), 1);
    assert_eq!(value["roles"].as_array().unwrap().len(), 1);
    assert!(!value["coverage"].as_array().unwrap().is_empty());
}
