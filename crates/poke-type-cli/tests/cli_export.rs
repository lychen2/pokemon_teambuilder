#[test]
fn export_round_trips_parsed_team() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["export", "--team", "tests/fixtures/basic-team.txt"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8(output.stdout).unwrap();
    assert!(text.contains("Garchomp @ Life Orb"));
    assert!(text.contains("Points: 2 HP / 32 Atk"));
    assert!(text.contains("- Earthquake"));
}
