# Data Integrity and Deal Radar

## Table of Contents

- Hallucination defense rules
- Data-tagging rules
- Uncertainty rules
- Deal Radar workflow
- Peer and transaction verification

## Hallucination defense rules

Apply these before analysis and keep them higher priority than narrative elegance.

- Verify revenue, earnings, debt, market cap, and transaction facts through web research before using them.
- If verification fails, say so explicitly.
- Never convert an unverified claim into a factual statement.
- Never fabricate peer multiples, precedent transactions, M&A rumors, or nonexistent listed companies.

## Data-tagging rules

Tag every number using these categories:

- `[Actual]`: verified disclosed data with a cited source
- `[Estimated]`: calculated from verified data, with the calculation basis stated
- `[Assumption]`: modeling input that can change

Never use `[Actual]` without a source.

## Uncertainty rules

Declare uncertainty clearly when:

- private-company financials are undisclosed
- the latest earnings are not yet reflected
- market practice is ambiguous
- the number would otherwise require guessing

If data is missing, say that the user can provide direct inputs for a more accurate model.

If a scenario is illustrative rather than real, mark it clearly as an example scenario and say it is not actual data.

## Deal Radar workflow

Before valuation, search the web for:

1. Pending M&A involving the company
2. Parent, subsidiary, affiliate, spin-off, or IPO situations
3. Major competitor deals in the same sector
4. Regulatory review, antitrust, or litigation issues
5. Activist pressure or breakup pressure
6. Major shareholder ownership changes

Output as:

- Deal title
- rumor / official announcement / under regulatory review
- valuation impact
- source

If nothing material is found, state that no major deal issues are currently confirmed.

Include only verified items.

## Peer and transaction verification

- List only real, listed peer companies
- Do not invent peer multiples
- If peer or transaction verification is incomplete, state that Bloomberg, Capital IQ, or equivalent data verification is needed
- Do not invent precedent M&A deals
