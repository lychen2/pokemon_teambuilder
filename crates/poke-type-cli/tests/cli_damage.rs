#[test]
fn damage_outputs_pair_summary() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args([
            "damage",
            "--attacker",
            "tests/fixtures/basic-team.txt",
            "--defender",
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
    assert_eq!(value["attackerSpeed"], 169);
    assert_eq!(value["defenderSpeed"], 169);
    assert_eq!(value["leftMoves"].as_array().unwrap().len(), 4);
    assert_eq!(value["leftMoves"][0]["moveName"], "Dragon Claw");
}
