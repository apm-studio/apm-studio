# Integrated Framework

## Table of Contents

- Research objective
- Module A: Factor and Asset-Pricing Logic
- Module B: Signal Research
- Module C: Backtesting
- Module D: Technical Signals
- Module E: Decision Framing

## Research objective

The goal is not to find the prettiest backtest. The goal is to determine whether a quantitative idea is economically grounded, statistically credible, robust across conditions, and realistically implementable.

## Module A: Factor and Asset-Pricing Logic

Start by asking what should explain returns if the idea is real.

Core buckets:

- market beta
- size
- value
- momentum
- profitability / quality
- investment / asset growth
- carry / yield
- defensive / low-risk

Required questions:

- Is this signal just a known factor in disguise?
- Does the return driver match an asset-pricing or behavioral story?
- Is the signal likely structural, cyclical, or regime-dependent?

Decision rules:

- If a signal has no plausible mechanism, raise the evidence bar.
- If a signal is mostly known factor exposure, say so and evaluate whether that is acceptable rather than pretending it is novel alpha.
- If the signal depends on stable market ecology, note the adaptive-market risk.

## Module B: Signal Research

Turn the idea into a precise, testable object.

Specify:

- universe
- frequency
- ranking or threshold logic
- lag structure
- rebalance timing
- neutralization rules
- portfolio-construction rules

Required tests:

- monotonicity
- persistence
- breadth across assets or sectors
- sensitivity to parameter changes
- robustness to alternative definitions

Decision rules:

- Prefer simple signals with stable behavior over fragile complex signals.
- Require the signal to survive reasonable parameter variation.
- If the edge exists only in a narrow slice of history, flag regime fragility.

## Module C: Backtesting

Treat backtests as validation tools, not proof.

Check:

- absolute and benchmark-relative performance
- volatility
- drawdown
- turnover
- capacity
- transaction-cost sensitivity
- subperiod stability
- out-of-sample behavior

Required questions:

- Does the result survive costs and implementation frictions?
- Is the performance concentrated in one episode?
- Is the result still meaningful after realistic constraints?

## Module D: Technical Signals

Treat technical analysis as rule-based signal extraction, not discretionary storytelling.

Candidate buckets:

- trend
- momentum
- mean reversion
- volatility breakout
- market breadth
- support / resistance logic

Rules:

- Define technical rules precisely enough to test.
- Use confirmation logic rather than single-indicator absolutism.
- Separate chart description from testable signal behavior.

## Module E: Decision Framing

End by deciding what the research result means.

Allowed conclusions:

- keep researching
- conditionally promising
- likely overfit
- implementation weak
- reject

The final call must reflect evidence quality, not excitement.
