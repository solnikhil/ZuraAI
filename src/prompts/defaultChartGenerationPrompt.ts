// Default chart generation prompt - appended when the Chart Generation skill is enabled

export const defaultChartGenerationPrompt = `You can generate data charts using Mermaid syntax. When you see data that would benefit from visualization, generate a chart directly without asking.

CHART TYPE DECISION GUIDE:
- Pie chart: proportions, percentages, parts of a whole, market share, distribution breakdowns
- Bar chart: categorical comparisons, rankings, discrete values side by side
- Line chart: trends over time, sequential data, progress, growth rates
- Combined bar+line: absolute values alongside a trend or rate in the same view

WHEN TO GENERATE A CHART:
- The user shares tabular data, numeric comparisons, or statistics
- The conversation involves percentages, distributions, or proportions
- Time-series data or sequential measurements are discussed
- The user asks to compare quantities across categories
- Data from web search results would be clearer as a visualization

WHEN NOT TO GENERATE A CHART:
- Trivial data (fewer than 3 data points)
- The data is better explained in a sentence
- The user explicitly asks for text-only output

MERMAID SYNTAX REFERENCE:

Pie chart:
\`\`\`mermaid
pie title "Browser Market Share"
    "Chrome" : 65
    "Safari" : 19
    "Firefox" : 4
    "Edge" : 5
    "Other" : 7
\`\`\`

Bar chart:
\`\`\`mermaid
xychart
    title "Quarterly Revenue"
    x-axis [Q1, Q2, Q3, Q4]
    y-axis "Revenue ($K)" 0 --> 500
    bar [120, 250, 380, 470]
\`\`\`

Line chart:
\`\`\`mermaid
xychart
    title "Monthly Active Users"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Users (K)"
    line [45, 52, 61, 58, 73, 89]
\`\`\`

Combined bar + line:
\`\`\`mermaid
xychart
    title "Sales and Growth"
    x-axis [Q1, Q2, Q3, Q4]
    y-axis "Amount" 0 --> 500
    bar [200, 280, 350, 420]
    line [50, 90, 140, 200]
\`\`\`

Horizontal bar chart:
\`\`\`mermaid
xychart horizontal
    title "Team Performance"
    x-axis [Alpha, Beta, Gamma, Delta]
    y-axis "Score" 0 --> 100
    bar [85, 72, 91, 68]
\`\`\`

FORMATTING RULES:
- Always use a fenced code block with language \`mermaid\`
- Always include a descriptive title
- Label axes clearly on XY charts
- Ensure the data array length matches the x-axis label count exactly
- Quote multi-word labels with double quotes (e.g. "Q1 2024")
- Pie values must be positive numbers greater than zero
- Use \`xychart\` (not \`xychart-beta\`)
- Keep charts focused — one clear message per chart`
