---
name: openbb-data-fetcher
description: Fetch financial, market, economic, fundamental, news, options, crypto, ETF, index, and macro data through the OpenBB Python interface instead of the OpenBB MCP server. Use when an agent needs current or historical data from OpenBB-supported providers, needs to replace OpenBB MCP calls with direct Python/OpenBB usage, or must return source-tagged, reproducible datasets with clear query parameters, provider details, and data-quality notes.
---

# OpenBB Data Fetcher

## Role

Use OpenBB as a standalone data access layer. Retrieve requested data, preserve provenance, normalize it into a usable structure, and make uncertainty explicit in the returned dataset package.

## Default Behavior

- Use the OpenBB Python package directly with `from openbb import obb`.
- Do not use the OpenBB MCP server unless the user explicitly asks for MCP.
- Prefer the bundled `scripts/fetch_openbb.py` helper for simple endpoint calls instead of ad hoc shell heredocs.
- Prefer official OpenBB endpoints and provider extensions over web scraping.
- Do not substitute ordinary web search just because OpenBB is not installed; install OpenBB, retry the request, or report the installation blocker.
- Use web search as a fallback only after OpenBB installation, import, endpoint, provider, or credential setup has failed and the requested task still needs an answer.
- When using fallback web research, label it clearly as `non-OpenBB fallback data` and cite sources; do not imply it came from OpenBB.
- Return structured data first: DataFrame, CSV, JSON, or a concise schema/sample when the dataset is large.
- Keep raw provider fields unless the user asks for a transformed model-ready dataset.

## Quick Start

1. Identify the data domain: equity, ETF, index, crypto, fixed income, options, economics, fundamentals, news, analyst estimates, calendar events, or regulatory filings.
2. Identify the instrument identifiers, date range, frequency, provider preference, and required fields.
3. Check whether OpenBB is installed. If it is missing, install it into the active Python environment and retry the same request.
4. Use the reusable helper when a simple endpoint call is enough. Do not force `provider="yfinance"` unless that endpoint supports it:

```bash
python skills/data-access/openbb-data-fetcher/scripts/fetch_openbb.py \
  --install-if-missing \
  --endpoint equity.price.historical \
  --params '{"symbol":"AAPL","start_date":"2024-01-01","provider":"yfinance"}' \
  --output /tmp/aapl_prices.csv
```

5. For exploratory work, use Python directly:

```python
from openbb import obb

result = obb.equity.price.historical(
    symbol="AAPL",
    start_date="2024-01-01",
    provider="yfinance",
)
df = result.to_dataframe()
```

For provider-specific fundamentals such as segment or geography revenue, do not assume `yfinance` works:

```bash
python skills/data-access/openbb-data-fetcher/scripts/fetch_openbb.py \
  --install-if-missing \
  --endpoint equity.fundamental.revenue_per_segment \
  --params '{"symbol":"NVDA","provider":"fmp"}' \
  --output /tmp/nvda_segment_revenue.csv
```

## Installation Guidance

- Official current baseline: `pip install openbb`.
- When this skill is triggered, treat missing OpenBB as a setup step, not as permission to use generic web search.
- Prefer `python -m pip install openbb` in the same interpreter that will run the data request.
- Use `pip install openbb[all]` only when broad provider coverage is needed and installation size is acceptable.
- For a narrow provider, prefer installing the relevant extension package instead of all extras.
- OpenBB currently supports Python 3.10+; if installation fails, verify the active Python version and OpenBB docs before changing code.
- Never commit API keys or credential files.
- Web browsing is allowed to inspect official OpenBB documentation, provider setup requirements, or to provide fallback data after OpenBB has genuinely failed.

Minimal install-and-retry pattern:

```bash
python -m pip install openbb
python skills/data-access/openbb-data-fetcher/scripts/fetch_openbb.py \
  --endpoint equity.price.historical \
  --params '{"symbol":"AAPL","start_date":"2024-01-01","provider":"yfinance"}' \
  --output /tmp/aapl_prices.csv
```

## Credentials

- Use provider credentials only from the user's existing environment, OpenBB `.env`, OpenBB `user_settings.json`, or explicit session-only Python assignment.
- Prefer existing credentials in this order: active process environment, `~/.openbb_platform/.env`, `~/.openbb_platform/user_settings.json`, then session-only assignment.
- If credentials are missing, try a no-key provider such as `yfinance` only when it can satisfy the request.
- If a requested provider requires a key, stop and report the missing credential by provider and field name.
- Keep `~/.openbb_platform/.env`, `~/.openbb_platform/user_settings.json`, and runtime credential values out of repo files.

## Environment Variables

OpenBB can read environment variables from the active process and from `~/.openbb_platform/.env`, located next to `user_settings.json`.

For provider API keys, use uppercase environment variable names ending in `_API_KEY` when the provider follows that pattern:

```bash
mkdir -p ~/.openbb_platform
printf 'FMP_API_KEY="replace_with_key"\n' >> ~/.openbb_platform/.env
printf 'FRED_API_KEY="replace_with_key"\n' >> ~/.openbb_platform/.env
```

OpenBB exposes these as lowercase credential fields, for example `FMP_API_KEY` becomes `obb.user.credentials.fmp_api_key`.

For current-session-only use, set environment variables before importing OpenBB:

```python
import os

os.environ["FMP_API_KEY"] = "replace_with_key"

from openbb import obb
```

Some credentials do not end in `_API_KEY`, such as tokens or account-type flags. For those, prefer `user_settings.json` or session-only assignment after inspecting the provider's required credential field.

## If No Environment Variable Exists

Use one of these paths:

1. Use a no-key provider if it covers the request:

```python
from openbb import obb

prices = obb.equity.price.historical(
    symbol="AAPL",
    start_date="2024-01-01",
    provider="yfinance",
)
```

2. Set the key for the current Python session only:

```python
from openbb import obb

obb.user.credentials.fmp_api_key = "replace_with_key"
data = obb.equity.fundamental.metrics(symbol="AAPL", provider="fmp")
```

3. Store the key locally in `~/.openbb_platform/user_settings.json`:

```json
{
  "credentials": {
    "fmp_api_key": "replace_with_key",
    "fred_api_key": "replace_with_key",
    "polygon_api_key": "replace_with_key"
  }
}
```

Restart the Python process after adding credentials to `.env` or `user_settings.json`.

## Fallback Policy

OpenBB is the primary path. Before falling back, make a real attempt to:

- Import OpenBB.
- Install OpenBB into the active Python environment if it is missing.
- Retry the same endpoint call.
- If validation says the provider is invalid and names an allowed provider, retry with that provider.
- Inspect the installed route tree if the endpoint is missing.
- Try an available no-key provider when credentials are unavailable and it can satisfy the request.

Use web search only after those steps fail or are blocked by environment, package, provider, credential, or route limitations. In the final output, state:

- That OpenBB failed or was unavailable.
- The failure reason at a practical level.
- That the returned data is `non-OpenBB fallback data`.
- The sources, timestamps, and any comparability limits.

## Endpoint Selection

Use OpenBB's route hierarchy directly:

- Prices: `obb.equity.price.historical`, `obb.crypto.price.historical`, index or ETF price routes when available.
- Fundamentals: `obb.equity.fundamental.*` routes for statements, ratios, metrics, profile, and related company data.
- Economics and macro: FRED, IMF, OECD, ECB, BLS, Federal Reserve, or Trading Economics provider routes when available.
- News and filings: news routes, SEC routes, or provider-specific routes when a verifiable source is needed.
- Options and derivatives: options routes only after confirming symbol format, expiration, and provider support.

If the exact route is unclear, inspect the installed OpenBB interface:

```python
from openbb import obb

dir(obb.equity)
dir(obb.equity.price)
help(obb.equity.price.historical)
```

## Provider Selection

- Treat provider compatibility as endpoint-specific. A provider that works for prices may not work for fundamentals, estimates, segments, filings, or macro data.
- Do not use `yfinance` as a universal fallback. It is often useful for prices and some estimates, but many fundamental routes require providers such as `fmp`.
- If OpenBB raises a validation error like `provider -> input: yfinance -> Input should be 'fmp'`, retry the same endpoint with `provider="fmp"`.
- If the corrected provider requires credentials, check environment variables and `user_settings.json` before falling back.
- For `revenue_per_segment` and `revenue_per_geography`, expect `fmp` unless the installed OpenBB route says otherwise.
- Record provider changes in the output so the user can see that the request started with one provider and succeeded or failed with another.

## Output Contract

For every returned dataset, include:

- Query intent and endpoint used.
- Provider and credential status when known.
- Symbols or identifiers requested.
- Date range, frequency, and timezone assumptions.
- Row count, column list, and a small sample.
- Any missing fields, provider limits, stale data warnings, or survivorship-bias concerns.

For returned values and derived fields, tag numbers as:

- `[actual]` for data returned by a named provider or official filing/source.
- `[derived]` for calculations made from fetched data.
- `[assumption]` for user-provided or scenario inputs.
- `[unavailable]` for fields the provider did not return.

## Data Quality Rules

- Validate symbols and date ranges before interpreting results.
- Check for empty DataFrames, duplicated timestamps, missing close values, split-adjustment assumptions, and currency mismatches.
- For multi-provider comparisons, do not merge series until calendar, timezone, currency, adjustment basis, and frequency are aligned.
- For fundamentals, preserve fiscal period, filing date, currency, restatement status if available, and provider provenance.
- For macro data, preserve release date, vintage, frequency, seasonal adjustment, and units when available.
- Treat OpenBB output as provider data, not as guaranteed truth; mention source limitations.

## Failure Handling

- If OpenBB is not installed, install it and retry. If installation fails, report the exact install command, active Python version, and failure output.
- If an endpoint is missing, inspect the installed route tree; OpenBB routes can differ by package version and installed extensions.
- If a provider validation error names an allowed provider, retry once with that provider before giving up or falling back.
- If the provider returns no data, retry only after checking ticker format, date range, and provider support.
- If the user requested real-time data, state whether the provider appears delayed or end-of-day.
- If provider terms, rate limits, or credentials block the request, explain the blocker without inventing substitute data.
- If OpenBB cannot be installed or the route cannot return the requested dataset, use web fallback only when the task can still be answered responsibly from cited public sources.
- If fallback data would be unreliable, unavailable, or not comparable to the requested OpenBB dataset, stop with a blocker instead of inventing or over-smoothing the result.
