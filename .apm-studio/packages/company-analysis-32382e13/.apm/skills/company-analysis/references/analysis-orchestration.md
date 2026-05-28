# Analysis Orchestration

## Table of Contents

- Automatic routing logic
- Core principle
- Framework stack by prompt type
- The eight framework families
- Reverse validation rules

## Automatic routing logic

Trigger from the user's wording without follow-up questions.

### Default company analysis

Prompt examples:

- `[Company] analyze`
- `Analyze [Company]`
- company name only

Routing:

- Listed company: Narrative + Reverse DCF + Forward DCF + Trading Comps + Sensitivity + So What
- Private startup: Operating Model + Unit Economics + DCF
- Holding company or large conglomerate: SOTP + Segment Comps
- Ambiguous case: Narrative + Reverse DCF + Forward DCF + Trading Comps + Sensitivity

For listed companies, always define the Narrative and run Reverse DCF before Forward DCF.

### M&A trigger

Prompt examples:

- `A acquires B`
- `M&A`

Routing:

- Accretion / Dilution
- Precedent Transactions

### LBO trigger

Prompt examples:

- `[Company] LBO`
- `[Company] buyout`

Routing:

- LBO Model
- IC Memo

### IPO trigger

Prompt examples:

- `[Company] IPO`
- `[Company] listing`

Routing:

- IPO Pricing
- Trading Comps

### Debt / credit trigger

Prompt examples:

- `[Company] debt`
- `[Company] credit`

Routing:

- Credit Analysis
- Debt Capacity

### Risk trigger

Prompt examples:

- `[Company] risk`

Routing:

- Sensitivity
- Scenario Analysis

## Core principle

The starting point of every analysis is not "What is fair value?" The starting point is "What expectations does the current price imply?"

Use this order:

1. Narrative
2. Reverse DCF
3. Forward DCF
4. Comps and cross-checks
5. Scenarios and So What

## The eight framework families

### 0. Narrative and Expectations Framework

- Define the company's current market story
- Convert story into financial expectations
- Extract implied growth, margin, and reinvestment assumptions through Reverse DCF
- Test those assumptions against industry reality

### 1. DCF using FCFF

Formula:

- FCFF = EBIT x (1 - Tax) + D&A - Capex - Delta NWC

Rules:

- State WACC calculation logic
- State terminal-value logic and why it is industry-plausible
- Use DCF as a comparison point to Reverse DCF, not as an isolated answer

### 2. Trading Comps

- Use 7 to 15 real, listed peers when possible
- Consider P/S, P/E, and EV/EBITDA
- Use percentile framing and premium / discount logic
- Interpret multiples as compressed expectations

### 3. SOTP

- Split segments cleanly
- Separate option value when needed
- Distinguish core and non-core assets

### 4. Sensitivity and Scenario Analysis

- Use bull, base, and bear cases
- Probability-weight the scenarios
- Translate events into per-share price impact
- Mention not just expected value but also volatility

### 5. M&A Accretion / Dilution

- Deal structure
- Pro forma EPS
- Synergies
- Breakeven logic

### 6. LBO Model

- Sources and Uses
- Debt structure
- IRR
- Cash-on-Cash multiple

### 7. Operating Model and Unit Economics

- Revenue build-up
- CAC / LTV
- Cohort logic
- Burn rate

### 8. IC Memo

- Summary
- Investment case
- Valuation
- Risks
- Recommendation

## Reverse validation rules

Always disclose:

- Gap between derived value and current market cap or price
- Caution flag when the gap exceeds plus or minus 30 percent
- The revenue CAGR, EBIT margin, and reinvestment rate needed to justify the current price
- Whether those requirements are realistic versus industry structure and peer history
