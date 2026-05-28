# Output Contract

## Required behavior

Always produce the analysis in this order:

1. Research question
2. Economic rationale
3. Signal definition
4. Validation summary
5. Overfitting and data-quality risks
6. Risk and attribution summary
7. Final decision
8. What to test next

## Required output shape

Start with:

Research Question:

Then write:

- what the hypothesis is
- what asset universe and horizon it targets

Next section:

Economic Rationale:

- explain why the signal should work
- note whether it maps to known factor logic, behavioral logic, or market-structure logic

Next section:

Signal Definition:

- define inputs, transformations, ranking logic, and timing

Next section:

Validation Summary:

- summarize what the backtest suggests
- identify whether the evidence is strong, mixed, or weak

Next section:

Overfitting and Data Risks:

- list the most important overfitting threats
- list data-pipeline risks

Next section:

Risk and Attribution:

- summarize beta, factor, drawdown, or implementation exposures
- state what appears to be driving returns

Final section:

Decision:

Use one of these endings:

- keep researching
- conditionally promising
- likely overfit
- implementation weak
- reject

Then add:

What to Test Next:

- list two to four concrete next checks

## Evidence tagging

Tag statements as:

- `[actual]`
- `[inference]`
- `[assumption]`

Rules:

- do not invent backtest metrics or validation results
- do not overclaim robustness from one strong chart
- lower confidence when data quality, sample coverage, or implementation realism is weak
