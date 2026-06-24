#[test]
fn validate_team_reports_errors_as_json() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args([
            "validate-team",
            "--team",
            "tests/fixtures/invalid-points-team.txt",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(
        value["errors"]
            .as_array()
            .unwrap()
            .iter()
            .any(|issue| issue["code"] == "points-total")
    );
}
