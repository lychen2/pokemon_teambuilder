#[test]
fn parse_command_outputs_json() {
    let fixture = "tests/fixtures/basic-team.txt";
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["parse", "--team", fixture])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["errors"].as_array().unwrap().len(), 0);
    assert!(value["configs"].as_array().unwrap().len() >= 1);
}
