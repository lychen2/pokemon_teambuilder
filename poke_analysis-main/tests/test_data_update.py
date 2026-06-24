import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "poke_analysis-main"))

from default_preset import common, vgcpastes
from data_update.team_planner_assets import build_pokemon_manifest
from default_preset.vgcpastes import apply_fallback_configs


def icon_file(manifest, species_id):
    return Path(manifest[species_id]["file"]).name


class VgcpastesCsvSourceTests(unittest.TestCase):
    def test_champions_mb_csv_is_vgcpastes_source(self):
        self.assertEqual(common.VGCPASTES_CSV_PATH.name, "VGCPastes Repository - Champions M-B.csv")

        rows = vgcpastes.parse_vgcpastes_rows(limit=2)

        self.assertEqual([row.team_id for row in rows], ["MB129", "MB128"])
        self.assertEqual(rows[0].species_names[:3], ("Floette-Mega", "Pyroar-Mega", "Ninetales"))
        self.assertEqual(rows[0].owner, "Snorlaxpikachu1")



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



if __name__ == "__main__":
    unittest.main()
