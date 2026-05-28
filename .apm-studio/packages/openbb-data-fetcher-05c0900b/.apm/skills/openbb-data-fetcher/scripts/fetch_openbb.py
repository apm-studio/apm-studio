#!/usr/bin/env python3
"""Fetch data from an OpenBB endpoint and write CSV or JSON output."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call an OpenBB endpoint such as equity.price.historical."
    )
    parser.add_argument(
        "--endpoint",
        required=True,
        help="Dot path below obb, for example: equity.price.historical",
    )
    parser.add_argument(
        "--params",
        default="{}",
        help="JSON object of keyword arguments for the endpoint.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output file path. Use .csv for tabular output or .json for records.",
    )
    parser.add_argument(
        "--metadata",
        help="Optional JSON metadata output path.",
    )
    parser.add_argument(
        "--install-if-missing",
        action="store_true",
        help="Install openbb with the active Python interpreter if it is missing, then retry.",
    )
    parser.add_argument(
        "--no-provider-validation-retry",
        action="store_true",
        help="Disable one automatic retry when OpenBB says the selected provider is invalid.",
    )
    return parser.parse_args()


def load_params(raw: str) -> dict[str, Any]:
    try:
        params = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"--params must be valid JSON: {exc}") from exc
    if not isinstance(params, dict):
        raise SystemExit("--params must decode to a JSON object.")
    return params


def resolve_endpoint(root: Any, endpoint: str) -> Any:
    current = root
    for part in endpoint.split("."):
        if not part:
            raise SystemExit("Endpoint contains an empty path segment.")
        if not hasattr(current, part):
            raise SystemExit(f"OpenBB endpoint segment not found: {part!r} in {endpoint!r}")
        current = getattr(current, part)
    if not callable(current):
        raise SystemExit(f"OpenBB endpoint is not callable: {endpoint}")
    return current


def to_dataframe(result: Any) -> Any:
    if hasattr(result, "to_dataframe"):
        return result.to_dataframe()
    if hasattr(result, "results") and hasattr(result.results, "to_dataframe"):
        return result.results.to_dataframe()
    return None


def write_output(result: Any, output_path: Path) -> dict[str, Any]:
    df = to_dataframe(result)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    metadata: dict[str, Any] = {
        "output": str(output_path),
        "format": output_path.suffix.lstrip(".").lower(),
    }

    if df is not None:
        metadata.update(
            {
                "rows": int(len(df)),
                "columns": list(map(str, df.columns)),
            }
        )
        if output_path.suffix.lower() == ".json":
            df.to_json(output_path, orient="records", date_format="iso", indent=2)
        else:
            df.to_csv(output_path, index=True)
        return metadata

    serializable = result.model_dump(mode="json") if hasattr(result, "model_dump") else result
    output_path.write_text(json.dumps(serializable, indent=2, default=str), encoding="utf-8")
    metadata["rows"] = None
    metadata["columns"] = None
    return metadata


def provider_hint_from_error(error: Exception) -> str | None:
    message = str(error)
    if "provider" not in message or "Input should be" not in message:
        return None
    providers = re.findall(r"Input should be '([^']+)'", message)
    if len(providers) == 1:
        return providers[0]
    return None


def call_endpoint(endpoint: Any, params: dict[str, Any], retry_provider_validation: bool) -> tuple[Any, dict[str, Any]]:
    try:
        return endpoint(**params), {}
    except Exception as exc:
        provider_hint = provider_hint_from_error(exc)
        if (
            retry_provider_validation
            and provider_hint
            and params.get("provider") != provider_hint
        ):
            retried_params = dict(params)
            old_provider = retried_params.get("provider")
            retried_params["provider"] = provider_hint
            result = endpoint(**retried_params)
            return result, {
                "provider_retry": {
                    "from": old_provider,
                    "to": provider_hint,
                    "reason": "OpenBB provider validation error",
                    "first_error": str(exc),
                },
                "params_used": retried_params,
            }
        raise


def import_openbb(install_if_missing: bool) -> Any:
    try:
        from openbb import obb

        return obb
    except ImportError:
        if not install_if_missing:
            print(
                "OpenBB is not installed in this Python environment. "
                "Install with: python -m pip install openbb, or rerun with "
                "--install-if-missing.",
                file=sys.stderr,
            )
            raise SystemExit(2)

    command = [sys.executable, "-m", "pip", "install", "openbb"]
    completed = subprocess.run(command, text=True)
    if completed.returncode != 0:
        print(
            "OpenBB installation failed. Command attempted: "
            + " ".join(command),
            file=sys.stderr,
        )
        raise SystemExit(completed.returncode)

    try:
        from openbb import obb

        return obb
    except ImportError:
        print(
            "OpenBB installation completed, but import still failed in this interpreter.",
            file=sys.stderr,
        )
        raise SystemExit(2)


def main() -> int:
    args = parse_args()
    params = load_params(args.params)

    obb = import_openbb(args.install_if_missing)
    endpoint = resolve_endpoint(obb, args.endpoint)
    result, call_metadata = call_endpoint(
        endpoint,
        params,
        retry_provider_validation=not args.no_provider_validation_retry,
    )
    metadata = write_output(result, Path(args.output))
    metadata.update({"endpoint": args.endpoint, "params": params})
    metadata.update(call_metadata)

    if args.metadata:
        metadata_path = Path(args.metadata)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(json.dumps(metadata, indent=2, default=str), encoding="utf-8")

    print(json.dumps(metadata, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
