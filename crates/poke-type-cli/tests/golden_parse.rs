#[test]
fn parse_matches_js_stable_fields() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_poke-type-cli"))
        .args(["parse", "--team", "tests/fixtures/basic-team.txt"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let rust_json: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    let js_json: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/golden/parse/basic-team.expected.json"
    ))
    .unwrap();
    let rust_config = &rust_json["configs"][0];
    let js_config = &js_json["configs"][0];
    for field in [
        "speciesId",
        "displayName",
        "ability",
        "item",
        "nature",
        "level",
    ] {
        assert_eq!(rust_config[field], js_config[field], "field {field}");
    }
    assert_eq!(rust_config["championPoints"], js_config["championPoints"]);
    assert_eq!(rust_config["moveNames"], js_config["moveNames"]);
}
