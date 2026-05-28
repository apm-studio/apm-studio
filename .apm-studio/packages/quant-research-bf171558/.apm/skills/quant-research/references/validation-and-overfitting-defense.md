# Validation and Overfitting Defense

## Table of Contents

- Validation hierarchy
- Overfitting checklist
- Statistical caution flags
- Robustness tests
- Decision rules

## Validation hierarchy

Use this order:

1. in-sample hypothesis development
2. out-of-sample testing
3. walk-forward or rolling validation
4. regime and subperiod stress tests
5. implementation realism checks

Do not treat in-sample excellence as validation.

## Overfitting checklist

Check for:

- too many parameter trials
- data snooping
- cherry-picked start or end dates
- survivorship bias
- look-ahead bias
- target leakage
- benchmark gaming
- fragile threshold tuning

## Statistical caution flags

Raise caution when:

- Sharpe ratio depends on one narrow episode
- small changes in parameters destroy performance
- effect disappears after costs
- too many ideas were tried before the winner was selected
- sample size is too short for the holding period
- the strategy depends on unstable tail outcomes

## Robustness tests

Require some combination of:

- parameter stability
- alternative universe test
- alternative rebalance schedule
- transaction-cost stress
- delayed execution test
- subperiod stability
- factor-neutral or beta-adjusted check
- attribution of returns

## Decision rules

- If the idea survives only one exact specification, treat it as likely overfit.
- If the signal works before costs but not after costs, call implementation weak rather than promising.
- If the signal survives broad perturbations and the economic rationale still fits, mark it conditionally promising.
- If the edge disappears after proper data hygiene or out-of-sample testing, reject it.
