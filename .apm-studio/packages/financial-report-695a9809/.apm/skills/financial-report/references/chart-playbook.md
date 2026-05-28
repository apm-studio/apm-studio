# Chart Playbook

## Table of Contents

- Chart selection rules
- Chart types
- Data and labeling rules
- Common finance use cases
- Chart mistakes to avoid

## Chart selection rules

Choose the chart that best answers the user's question.

- Use OHLCV or candlestick-style charts for price action, range behavior, breakouts, and trading context.
- Use line charts for time-series trends, indicator overlays, cumulative performance, and benchmark comparisons.
- Use bar charts for category comparisons, quarterly changes, factor rankings, and peer snapshots.
- Use pie charts only for part-to-whole composition with a small number of categories.
- Use tables when exact values matter more than shape or trend.
- Prefer a finance-native rendering backend for finance-native charts. See `references/chart-rendering-backends.md`.

## Chart types

### OHLCV

Use for:

- Open, high, low, close, and volume review
- Candlestick or bar-based market structure
- Moving averages or other overlays

Good fields:

- date
- open
- high
- low
- close
- volume

Common overlays:

- moving averages
- VWAP
- Bollinger Bands
- support and resistance levels

### Line chart

Use for:

- Price trend over time
- Relative performance
- Macro indicators
- Revenue, EPS, TVL, AUM, spreads, yields, or other time-series metrics

Good patterns:

- one to three main series per chart
- shared scale when comparison is direct
- indexed series when relative movement matters more than absolute level

### Bar chart

Use for:

- Peer comparison
- Quarter-over-quarter or year-over-year deltas
- Ranked exposures
- Segment revenue or contribution

### Pie chart

Use for:

- Revenue mix
- Portfolio weights
- Sector weights
- Holder or customer mix

Only use when:

- there are few categories
- composition matters more than exact comparison

## Data and labeling rules

- Always label units, time periods, and currency when relevant.
- State whether values are raw, indexed, normalized, percentage, or basis points.
- Keep legends short and specific.
- Add a source note when data origin matters.
- Prefer chart titles that answer the question, not generic labels.

## Common finance use cases

- Equity initiation: price trend line chart, margin trend line chart, peer valuation bar chart, revenue mix pie chart
- Crypto report: token price OHLCV chart, on-chain activity line chart, holder or supply mix pie chart
- Credit note: leverage trend line chart, maturity wall bar chart, spread history line chart
- Portfolio update: allocation pie chart, sector exposure bar chart, cumulative return line chart
- Macro report: rate path line chart, inflation decomposition bar chart, yield-curve comparison line chart

## Chart mistakes to avoid

- Pie chart with too many slices
- OHLCV chart without volume or date context
- Line chart with too many series
- Mixed units on one axis without explanation
- Decorative charts with no analytical role
