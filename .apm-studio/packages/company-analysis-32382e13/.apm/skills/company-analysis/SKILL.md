---
name: company-analysis
description: Automatically analyze a company or company-related finance situation from a short user prompt such as a company name, "analyze [company]," M&A, LBO, IPO, debt, credit, or risk requests. Use when an agent must infer the correct valuation and finance framework without asking follow-up questions, begin from market-implied expectations instead of immediate fair value, run Reverse DCF before Forward DCF for listed companies, perform web-verified data gathering and deal-radar checks, defend against hallucinations with explicit data tags and uncertainty statements, and produce a plain-text output with no markdown and no row-column tables.
---

# Company Analysis

## Overview

Use this skill to produce an IB-style investment analysis from minimal user input. Start from what the current price already implies, not from a fair-value claim, and force every valuation conclusion through verified data, explicit assumptions, and expectation decomposition.

## Quick Start

- If the user provides only a company name or a short prompt such as "[Company] analyze," do not ask clarifying questions. Infer the company type and run the most appropriate workflow immediately.
- For listed companies, always define the Narrative first and run Reverse DCF before Forward DCF.
- Run web research before using any revenue, profit, debt, market cap, or transaction figure.
- Read `references/analysis-orchestration.md` for routing logic and framework selection.
- Read `references/data-integrity-and-deal-radar.md` for hallucination defense and mandatory pre-analysis searches.
- Read `references/output-contract.md` for the exact output shape and plain-text rules.

## Core Workflow

### 1. Route the request automatically

- Infer the requested analysis from the prompt without follow-up questions.
- Use the default listed-company stack when the intent is ambiguous: Narrative, Reverse DCF, Forward DCF, Trading Comps, Sensitivity, and So What.
- Use the framework-routing rules in `references/analysis-orchestration.md`.

### 2. Gather and tag data before modeling

- Search the web for actual disclosed financial data before using any revenue, earnings, debt, or valuation number.
- Tag every number as `[Actual]`, `[Estimated]`, or `[Assumption]`.
- Never label a number as `[Actual]` unless the underlying source has been verified and cited.
- State uncertainty explicitly whenever the data is unavailable, stale, private, disputed, or not yet reported.

### 3. Run Deal Radar before valuation

- Search for pending M&A, subsidiary or parent transactions, competitor deals, regulatory or antitrust issues, activism or breakup pressure, and major shareholder ownership changes.
- Distinguish rumor, official announcement, and active regulatory review.
- Include only web-verified items with cited sources.

### 4. Start from Narrative and Expectations

- Define the story the market is pricing into the current stock or enterprise value.
- Translate that story into growth, margin, and reinvestment expectations.
- Run Reverse DCF before any Forward DCF for listed companies.
- Test whether the implied expectations are realistic relative to industry structure and operating history.

### 5. Run the relevant framework stack

- Use DCF on an FCFF basis when the business supports a cash-flow view and the data is sufficient.
- Use Trading Comps to interpret compressed expectations through multiples, not as a standalone verdict.
- Use SOTP for holding companies, conglomerates, or businesses with clearly separable segments.
- Use Sensitivity and Scenario Analysis for all major valuation outputs.
- Use M&A, LBO, IPO, Credit, or Operating Model frameworks when the prompt directly calls for them.

### 6. Translate valuation into decision language

- State what the current price requires, not just what your model says.
- Quantify the growth CAGR, EBIT margin, and reinvestment rate needed to justify the current price when the expectation gap matters.
- If your implied value and the current market value differ by more than 30 percent, mark it as caution and explain why.

### 7. Output in the required format

- Do not use markdown.
- Do not use row-column tables.
- Use the required plain-text block order defined in `references/output-contract.md`.

## Mandatory Rules

- Do not ask clarifying questions before producing the analysis.
- Do not fabricate data, comps, transactions, or deal rumors.
- Do not skip Reverse DCF for listed companies.
- Do not output unsupported certainty when the underlying information is incomplete.
- Do not present a fair value first and expectations second.

## Guardrails

- If disclosed financial data cannot be found, say so clearly and explain that the user can provide direct inputs for a more accurate model.
- If you switch into a hypothetical scenario, mark it as a non-actual example scenario.
- If peer multiples or transaction data cannot be verified, state that Bloomberg, Capital IQ, or equivalent verification is needed.
- If private-company financials are not disclosed, state the uncertainty instead of backfilling missing numbers as facts.
