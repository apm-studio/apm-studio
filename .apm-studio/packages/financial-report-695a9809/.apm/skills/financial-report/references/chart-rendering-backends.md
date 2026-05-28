# Chart Rendering Backends

Use this file when a financial report must generate chart images that can be embedded into a document.

## Backend Priority

Use this priority order:

1. TradingView `lightweight-charts`
2. `matplotlib.pyplot`

## Why this order

- Prefer `lightweight-charts` for finance-native visuals such as OHLCV, candlestick, volume, and indicator-heavy time-series charts.
- Prefer `matplotlib` as the fallback for chart types that are not naturally supported by `lightweight-charts`, especially pie charts and other non-core financial compositions.
- Use the backend that minimizes distortion between the analytical intent and the final embedded image.

## Use `lightweight-charts` for

- OHLCV and candlestick charts
- Price plus volume views
- Time-series indicator charts
- Benchmark-relative line charts
- Multi-pane financial chart layouts

## Use `matplotlib.pyplot` for

- Pie charts
- Simpler bar charts when static export is enough
- Composition charts
- Special-case visuals that are unsupported or cumbersome in `lightweight-charts`

## Image export rules

- Export charts as image files for document embedding, preferably `png` unless the task clearly benefits from another format.
- Keep image dimensions explicit and consistent across a report.
- Preserve readable labels, legends, and titles at the exported size.
- Name files predictably so a downstream formatter can place them deterministically.

## Lightweight Charts export guidance

- Render the chart in a browser-capable environment.
- Use the chart screenshot API to obtain a canvas image of the rendered chart.
- Serialize the resulting canvas into an image artifact for embedding.
- Preserve panes and overlays when they are analytically meaningful.

## Matplotlib export guidance

- Render the figure with stable sizing and dpi.
- Use `savefig()` to write the image file.
- Prefer tight bounding boxes when whitespace would otherwise dilute readability.

## Practical decision rule

- If the chart is finance-native and time-series heavy, start with `lightweight-charts`.
- If the chart is a composition or unsupported special case, use `matplotlib`.
- If both can work, prefer the one that produces the cleaner embedded image with less post-processing.
