import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "poke_analysis-main"))

from default_preset import common, vgcpastes
from data_update.team_planner_assets import build_pokemon_manifest
from default_preset.vgcpastes import apply_fallback_configs
from data_update import champions


def icon_file(manifest, species_id):
    return Path(manifest[species_id]["file"]).name


class VgcpastesCsvSourceTests(unittest.TestCase):
    def test_champions_mb_csv_is_vgcpastes_source(self):
        self.assertEqual(common.VGCPASTES_CSV_PATH.name, "VGCPastes Repository - Champions M-B.csv")

        rows = vgcpastes.parse_vgcpastes_rows(limit=2)

        self.assertEqual([row.team_id for row in rows], ["MB259", "MB257"])
        self.assertEqual(rows[0].species_names[:3], ("Metagross-Mega", "Charizard", "Toxapex"))
        self.assertEqual(rows[0].owner, "ub_slow")



class VgcpastesFallbackTests(unittest.TestCase):
    def test_fallback_only_fills_missing_species_selected_configs(self):
        primary_configs = [
            {"speciesId": "garchomp", "source": {"teamId": "MB1"}},
            {"speciesId": "raichu", "source": {"teamId": "MB2"}},
        ]
        primary_selected = [
            {"speciesId": "garchomp", "source": {"teamId": "MB1"}},
        ]
        fallback_configs = [
            {"speciesId": "garchomp", "source": {"teamId": "PC1"}},
            {"speciesId": "raichu", "source": {"teamId": "PC2"}},
            {"speciesId": "snorlax", "source": {"teamId": "PC3"}},
        ]
        fallback_selected = [
            {"speciesId": "garchomp", "source": {"teamId": "PC1"}},
            {"speciesId": "raichu", "source": {"teamId": "PC2"}},
            {"speciesId": "snorlax", "source": {"teamId": "PC3"}},
        ]

        merged_configs, merged_selected, added = apply_fallback_configs(
            primary_configs,
            primary_selected,
            fallback_configs,
            fallback_selected,
        )

        self.assertEqual(added, 1)
        self.assertEqual([config["speciesId"] for config in merged_configs], ["garchomp", "raichu", "snorlax"])
        self.assertEqual([config["speciesId"] for config in merged_selected], ["garchomp", "snorlax"])
        self.assertEqual(merged_configs[-1]["source"]["sourceKind"], "vgcpastes-fallback")
        self.assertTrue(merged_configs[-1]["source"]["fallbackOnly"])

        teams = vgcpastes.build_paste_teams(merged_configs)
        self.assertEqual(teams, [])

class TeamPlannerIconManifestTests(unittest.TestCase):
    def test_selects_form_icon_by_team_planner_form_id(self):
        pokedex = {
            "raichu": {"num": 26, "name": "Raichu", "formeOrder": ["Raichu", "Raichu-Alola", "Raichu-Mega-X", "Raichu-Mega-Y"]},
            "raichualola": {"num": 26, "name": "Raichu-Alola", "baseSpecies": "Raichu"},
            "raichumegax": {"num": 26, "name": "Raichu-Mega-X", "baseSpecies": "Raichu"},
            "raichumegay": {"num": 26, "name": "Raichu-Mega-Y", "baseSpecies": "Raichu"},
            "charizard": {"num": 6, "name": "Charizard", "formeOrder": ["Charizard", "Charizard-Mega-X", "Charizard-Mega-Y"]},
            "charizardmegay": {"num": 6, "name": "Charizard-Mega-Y", "baseSpecies": "Charizard"},
        }
        files = [
            {"name": "0026_000_fd_n.png", "sourcePath": "/repo/0026_000_fd_n.png", "sourceUrl": "https://example.test/0026_000_fd_n.png"},
            {"name": "0026_000_md_n.png", "sourcePath": "/repo/0026_000_md_n.png", "sourceUrl": "https://example.test/0026_000_md_n.png"},
            {"name": "0026_001_mf_n.png", "sourcePath": "/repo/0026_001_mf_n.png", "sourceUrl": "https://example.test/0026_001_mf_n.png"},
            {"name": "0026_002_mf_n.png", "sourcePath": "/repo/0026_002_mf_n.png", "sourceUrl": "https://example.test/0026_002_mf_n.png"},
            {"name": "0026_003_mf_n.png", "sourcePath": "/repo/0026_003_mf_n.png", "sourceUrl": "https://example.test/0026_003_mf_n.png"},
            {"name": "0006_000_mf_n.png", "sourcePath": "/repo/0006_000_mf_n.png", "sourceUrl": "https://example.test/0006_000_mf_n.png"},
            {"name": "0006_001_mf_n.png", "sourcePath": "/repo/0006_001_mf_n.png", "sourceUrl": "https://example.test/0006_001_mf_n.png"},
            {"name": "0006_002_mf_n.png", "sourcePath": "/repo/0006_002_mf_n.png", "sourceUrl": "https://example.test/0006_002_mf_n.png"},
        ]
        planner_metadata = {
            "raichu": {"base_id": 26, "form_id": 0, "gender": ["fd", "md"]},
            "raichualola": {"base_id": 26, "form_id": 1, "gender": ["mf"]},
            "raichumegax": {"base_id": 26, "form_id": 2, "gender": ["mf"]},
            "raichumegay": {"base_id": 26, "form_id": 3, "gender": ["mf"]},
            "charizardmegay": {"base_id": 6, "form_id": 2, "gender": ["mf"]},
        }

        manifest = build_pokemon_manifest(
            pokedex,
            {},
            ["raichu", "raichualola", "raichumegax", "raichumegay", "charizardmegay"],
            files,
            planner_metadata,
        )

        self.assertEqual(icon_file(manifest, "raichu"), "0026_000_fd_n.png")
        self.assertEqual(icon_file(manifest, "raichualola"), "0026_001_mf_n.png")
        self.assertEqual(icon_file(manifest, "raichumegax"), "0026_002_mf_n.png")
        self.assertEqual(icon_file(manifest, "raichumegay"), "0026_003_mf_n.png")
        self.assertEqual(icon_file(manifest, "charizardmegay"), "0006_002_mf_n.png")

    def test_defaults_to_all_pokedex_icons_when_usable_ids_omitted(self):
        pokedex = {
            "kyogre": {"num": 382, "name": "Kyogre"},
            "fluttermane": {"num": 987, "name": "Flutter Mane"},
            "palafin": {"num": 964, "name": "Palafin"},
        }
        files = [
            {"name": "0382_000_uk_n.png", "sourcePath": "/repo/0382_000_uk_n.png", "sourceUrl": "https://example.test/0382_000_uk_n.png"},
            {"name": "0987_000_uk_n.png", "sourcePath": "/repo/0987_000_uk_n.png", "sourceUrl": "https://example.test/0987_000_uk_n.png"},
            {"name": "0964_000_mf_n.png", "sourcePath": "/repo/0964_000_mf_n.png", "sourceUrl": "https://example.test/0964_000_mf_n.png"},
        ]

        manifest = build_pokemon_manifest(pokedex, {}, None, files, {})

        self.assertEqual(icon_file(manifest, "kyogre"), "0382_000_uk_n.png")
        self.assertEqual(icon_file(manifest, "fluttermane"), "0987_000_uk_n.png")
        self.assertEqual(icon_file(manifest, "palafin"), "0964_000_mf_n.png")

class SelectableBattleSpeciesTests(unittest.TestCase):
    """Verify expand_usable_species_ids_with_mega_forms filters
    battleOnly non-Mega forms and battle-equivalent forms."""

    def setUp(self):
        self.fake_pokedex = {
            "palafin": {"num": 964, "name": "Palafin", "types": ["Water"],
                        "baseStats": {"hp": 100, "atk": 70, "def": 72, "spa": 53, "spd": 62, "spe": 100},
                        "abilities": {"0": "Zero to Hero"}},
            "palafinhero": {"num": 964, "name": "Palafin-Hero", "baseSpecies": "Palafin", "forme": "Hero",
                            "types": ["Water"],
                            "baseStats": {"hp": 100, "atk": 160, "def": 97, "spa": 106, "spd": 87, "spe": 100},
                            "abilities": {"0": "Zero to Hero"}, "battleOnly": "Palafin"},
            "vivillon": {"num": 666, "name": "Vivillon", "types": ["Bug", "Flying"],
                         "baseStats": {"hp": 80, "atk": 52, "def": 50, "spa": 90, "spd": 50, "spe": 89},
                         "abilities": {"0": "Shield Dust", "1": "Compound Eyes"}},
            "vivillonfancy": {"num": 666, "name": "Vivillon-Fancy", "baseSpecies": "Vivillon", "forme": "Fancy",
                              "types": ["Bug", "Flying"],
                              "baseStats": {"hp": 80, "atk": 52, "def": 50, "spa": 90, "spd": 50, "spe": 89},
                              "abilities": {"0": "Shield Dust", "1": "Compound Eyes"}},
            "charizard": {"num": 6, "name": "Charizard", "types": ["Fire", "Flying"],
                          "baseStats": {"hp": 78, "atk": 84, "def": 78, "spa": 109, "spd": 85, "spe": 100},
                          "abilities": {"0": "Blaze", "H": "Solar Power"}},
            "charizardmegax": {"num": 6, "name": "Charizard-Mega-X", "baseSpecies": "Charizard", "forme": "Mega-X",
                               "types": ["Fire", "Dragon"],
                               "baseStats": {"hp": 78, "atk": 130, "def": 111, "spa": 130, "spd": 85, "spe": 100},
                               "abilities": {"0": "Tough Claws"}, "requiredItem": "Charizardite X"},
            "charizardmegay": {"num": 6, "name": "Charizard-Mega-Y", "baseSpecies": "Charizard", "forme": "Mega-Y",
                               "types": ["Fire", "Flying"],
                               "baseStats": {"hp": 78, "atk": 104, "def": 78, "spa": 159, "spd": 115, "spe": 100},
                               "abilities": {"0": "Drought"}, "requiredItem": "Charizardite Y"},
        }
        self.fake_items = {"charizarditex": {"name": "Charizardite X"},
                           "charizarditey": {"name": "Charizardite Y"}}

    def test_filters_battleonly_non_mega(self):
        result = champions.expand_usable_species_ids_with_mega_forms(
            self.fake_pokedex, self.fake_items,
            ["palafin", "palafinhero", "vivillon"],
        )
        self.assertIn("palafin", result)
        self.assertIn("vivillon", result)
        self.assertNotIn("palafinhero", result, "battleOnly non-Mega should be excluded")

    def test_filters_battle_equivalent_form(self):
        result = champions.expand_usable_species_ids_with_mega_forms(
            self.fake_pokedex, self.fake_items,
            ["vivillon", "vivillonfancy"],
        )
        self.assertIn("vivillon", result)
        self.assertNotIn("vivillonfancy", result,
                         "battle-equivalent cosmetic form should be excluded")

    def test_preserves_mega_forms(self):
        result = champions.expand_usable_species_ids_with_mega_forms(
            self.fake_pokedex, self.fake_items,
            ["charizard"],
        )
        self.assertIn("charizard", result)
        self.assertIn("charizardmegax", result,
                      "Mega-X should be included (formeOrder expansion)")
        self.assertIn("charizardmegay", result,
                      "Mega-Y should be included (formeOrder expansion)")


if __name__ == "__main__":
    unittest.main()
