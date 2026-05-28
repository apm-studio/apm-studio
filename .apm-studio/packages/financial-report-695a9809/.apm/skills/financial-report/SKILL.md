---
name: financial-report
description: Package investing analysis into a publishable financial-report style with institutional section flow, thesis framing, valuation context, catalysts, risks, tables, and financial charts. Use when an agent needs to turn existing research into a broker-style or professional finance report for equities, crypto, credit, commodities, portfolios, or macro topics, including chart-heavy outputs such as indicator charts, OHLCV charts, line charts, bar charts, pie charts, and comparison visuals, while keeping the result structured enough for an external docx, pdf, markdown, or spreadsheet skill to render final files.
---

# Financial Report

## Overview

Use this skill to transform completed analysis into a polished financial report with a clear investment narrative, publication-ready structure, and supporting charts. Focus on editorial packaging, visual clarity, and analytical communication rather than file conversion alone.

## Quick Start

- Start only after the core investment analysis or dataset already exists.
- Identify the asset or topic, target audience, report date, author or desk if provided, and the intended stance or key takeaway.
- Decide whether the report is recommendation-led, market-update-led, valuation-led, or data-dashboard-led before writing.
- Read `references/financial-report-template.md` for the canonical report skeleton.
- Read `references/style-rules.md` for tone and section ordering.
- Read `references/chart-playbook.md` when the report includes indicators, OHLCV, line, pie, bar, or comparison charts.
- Read `references/chart-rendering-backends.md` when the report must generate chart images for downstream documents.

## Core Workflow

### 1. Build the report frame

- Create a title that combines the subject, the main hook, and the current stance or focus.
- Add a compact metadata block with date, coverage target, time horizon, and recommendation when available.
- Write an executive summary that makes the report's main conclusion clear immediately.

### 2. Lead with the investment view

- Surface the recommendation, thesis, valuation stance, or market view before background detail.
- Present the main reasons to own, avoid, monitor, or rotate into the asset in concise bullets.
- Keep the report directional, not merely descriptive.

### 3. Organize the body like professional finance research

- Use a consistent order: summary, thesis, subject overview, key drivers, valuation or metric context, charts and exhibits, catalysts, risks, and conclusion.
- Convert raw notes into claim-evidence form rather than source-dump prose.
- Keep tables and charts close to the argument they support.

### 4. Add charts intentionally

- Choose chart types based on the analytical question rather than decoration.
- Use OHLCV or candlestick-style charts for price action and market structure.
- Use line charts for time-series comparisons, indicators, trends, and benchmark-relative moves.
- Use bar charts for ranked comparisons, period-over-period changes, and peer snapshots.
- Use pie charts only for composition views such as revenue mix, portfolio weights, or ownership mix.
- Label axes, units, periods, legends, and sources clearly.
- Prefer TradingView `lightweight-charts` first for finance-native time-series visuals.
- Fall back to `matplotlib.pyplot` when the chart type is unsupported, awkward, or faster to render there.
- Export every chart as an image artifact that a downstream document generator can embed directly.

### 5. Adapt by asset type

- For equities, emphasize business model, earnings path, valuation range, catalysts, and operating charts.
- For crypto, emphasize protocol utility, adoption, token mechanics, valuation framing, on-chain or market indicators, and risk.
- For credit, emphasize cash generation, leverage, refinancing, spread behavior, covenant risk, and downside protection.
- For commodities, emphasize supply-demand setup, cycle position, macro drivers, inventory or curve data, and scenario ranges.
- For macro or portfolio reports, emphasize regime drivers, allocation logic, exposures, and benchmarking visuals.

### 6. Prepare for downstream rendering

- Output clean sectioned markdown or another neutral structured form unless the user explicitly asks for something else.
- Keep headings, tables, chart captions, footnotes, and disclaimers easy for an external formatting skill to preserve.
- Do not hard-code page-layout assumptions that belong to downstream docx or pdf tooling.

## Output Requirements

- Include: title, summary, thesis or main view, supporting analysis, charts or exhibit list, risks, and conclusion.
- Keep the writing concise, directional, and publication-ready.
- Separate observed facts from judgment calls.
- Make charts analytical, not ornamental.
- Make sure the structure can be passed directly into an external formatting skill.

## Guardrails

- Do not invent a recommendation unsupported by the source analysis.
- Do not add charts that do not answer a real question.
- Do not use pie charts for time-series data or too many categories.
- Do not let visual polish overwhelm analytical clarity.
- Do not rely on a specific file extension or rendering engine.
- Do not keep charts only as interactive widgets when the report requires embeddable document assets.
