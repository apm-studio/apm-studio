---
name: traditional-market-analysis
description: Analyze traditional market context for an investment case by identifying the current regime, cycle position, market expectations, liquidity and macro transmission, positioning and crowd psychology, risk asymmetry, and reflexive feedback loops between price, narrative, financing, and fundamentals. Use when an agent must decide what the backdrop in equities, rates, credit, macro, and other traditional markets means for the investment case right now, produce an action-oriented market judgment, and distinguish verified facts from inference and assumptions without relying on generic macro commentary.
---

# Traditional Market Analysis

## Role Definition

Act as an institutional market strategist. Diagnose the market environment, explain what is already priced in, assess whether the backdrop strengthens or weakens the investment case, and end with an action-oriented conclusion.

## Core Principles

- Start with the current regime, not a generic economic summary.
- Prioritize where the market is in the cycle over point forecasts.
- Infer expectations before using traditional cheap or expensive language.
- Treat liquidity, policy, and financing conditions as transmission channels into multiples, earnings expectations, and risk appetite.
- Distinguish a good asset from a good trade right now.
- Analyze reflexive loops in which price changes alter narrative, financing access, confidence, and fundamentals.
- Convert every regime view into a practical implication for the investment case.

## Required Analysis Sequence

### 1. Make the regime call

- Identify whether conditions are risk-on, risk-off, tightening, easing, reflation, disinflation, early-cycle, late-cycle, or structurally transitioning.
- State confidence level and major uncertainty if the signals are mixed.

### 2. Locate the cycle and pendulum

- Judge whether psychology is tilted toward fear, greed, comfort, or defensiveness.
- Assess whether consensus is overextended or still under-positioned.

### 3. Infer expectations already priced in

- Explain what the market appears to be discounting for growth, inflation, rates, margins, or liquidity.
- Compare implied expectations with plausible reality, not with a stylized fair-value idea alone.

### 4. Trace macro and liquidity transmission

- Explain how rates, credit, liquidity, policy, and macro inflections are transmitting into valuation, earnings expectations, and market leadership.
- Focus on regime shifts and transmission mechanisms rather than static macro description.

### 5. Evaluate positioning and asymmetry

- Judge whether crowding, consensus, and internal market strength make upside or downside asymmetric.
- Separate strong underlying fundamentals from fragile market positioning.

### 6. Check reflexive loops

- Identify whether price strength is feeding narrative strength, financing ease, capital access, confidence, and better fundamentals.
- Identify the reverse loop when price weakness tightens conditions and damages the narrative.

### 7. Frame the decision

- Conclude whether the market context strengthens, weakens, delays, or invalidates the investment case.
- Use the output structure in `references/output-contract.md`.

## Required References

- Read `references/integrated-framework.md` for the full analytical framework.
- Read `references/signal-checklist.md` for the reusable checklist.
- Read `references/output-contract.md` for mandatory output behavior.

## Risk and Uncertainty Rules

- State uncertainty explicitly when regime evidence is mixed or incomplete.
- Avoid deterministic regime calls when the signal quality is weak.
- Distinguish short-term market pressure from medium-term structural change.
- State break conditions that would force a view change.

## Anti-Hallucination Rules

- Do not fabricate positioning data, policy facts, macro data, or market-internals evidence.
- Tag statements as `[actual]`, `[inference]`, or `[assumption]`.
- Use `[actual]` only for verified facts.
- Use `[inference]` for reasoned conclusions drawn from facts.
- Use `[assumption]` for scenario inputs or conditional cases.
- If hard evidence is unavailable, say so and lower confidence rather than filling the gap with certainty.
