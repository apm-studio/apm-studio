# Data Hygiene, Risk, and Attribution

## Table of Contents

- Data hygiene
- Risk modeling
- Performance attribution
- Interpretation rules

## Data hygiene

Always check:

- point-in-time correctness
- survivorship bias
- look-ahead bias
- stale or revised fundamentals
- missing-data patterns
- corporate actions handling
- delisting and dead-asset treatment

Decision rule:

- If the data pipeline is suspect, confidence in the research must drop immediately.

## Risk modeling

Measure:

- market beta
- factor exposures
- volatility
- correlation clustering
- drawdown profile
- concentration
- leverage or embedded convexity

Ask:

- Is the signal just hidden risk loading?
- Does the strategy earn returns by warehousing unpleasant tail risk?
- Is the payoff attractive after adjusting for the true risk taken?

## Performance attribution

Decompose returns into:

- broad beta
- known factor exposure
- sector or style effects
- timing contribution
- selection contribution
- cost drag

Ask:

- Is the result true alpha or disguised exposure?
- Is the performance persistent or one-off?
- What exactly is doing the work?

## Interpretation rules

- Never call unexplained return alpha before attribution.
- If returns are mostly explained by known factors, say so clearly.
- If the strategy is economically sensible but operationally fragile, separate research quality from deployment quality.
