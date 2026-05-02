#!/usr/bin/env python3
import argparse

from data_update.pipeline import run_update


def parse_args():
    parser = argparse.ArgumentParser(description="Refresh local Champions VGC data.")
    parser.add_argument("--skip-assets", action="store_true", help="Skip sprite sheet downloads")
    parser.add_argument("--strict-pastes", action="store_true", help="Fail on invalid VGCPastes rows")
    return parser.parse_args()


def main():
    args = parse_args()
    run_update(skip_assets=args.skip_assets, strict_pastes=args.strict_pastes)


if __name__ == "__main__":
    main()
