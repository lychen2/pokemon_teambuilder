#!/usr/bin/env python3
import argparse
import subprocess
from pathlib import Path


from data_update.pipeline import run_update


def parse_args():
    parser = argparse.ArgumentParser(description="Refresh local Champions VGC data.")
    parser.add_argument("--strict-pastes", action="store_true", help="Fail on invalid VGCPastes rows")
    return parser.parse_args()


def main():
    args = parse_args()
    run_update(strict_pastes=args.strict_pastes)
    repo_root = Path(__file__).resolve().parents[1]
    subprocess.run(["node", "tools/build-derived-data.mjs"], cwd=repo_root, check=True)


if __name__ == "__main__":
    main()
