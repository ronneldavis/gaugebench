# GaugeBench

GaugeBench is a visual reasoning benchmark that evaluates whether AI models can accurately read analog gauges - a task that is straightforward for humans but challenging for current frontier models.

## Installation

```bash
npm install -g @onvo-ai/gaugebench
```

## Environment Variables

Set one or both of the following API keys:

- `OPENROUTER_API_KEY`: For accessing models via OpenRouter
- `OPENAI_API_KEY`: For accessing OpenAI models directly
- `OPENAI_API_URL`: (Optional) Custom OpenAI API URL, defaults to `https://api.openai.com/v1/chat/completions`

## Usage

1. Place gauge images in the `inputs/` folder (e.g., `1.jpeg`, `2.png`).
2. Create `outputs.csv` with ground truth data: `filename,min_value,max_value,reading_value,units`.
3. Run the benchmark:

```bash
gaugebench run
```

The CLI will prompt you to select the API (if both keys are set) and enter the model ID.

## Supported APIs

- **OpenRouter**: Access to various vision models (e.g., `openai/gpt-4o`)
- **OpenAI**: Direct access to OpenAI models (e.g., `gpt-4o`)

## Website

View the leaderboard at [https://ronneldavis.github.io/gaugebench/](https://ronneldavis.github.io/gaugebench/)

## Paper

[Read the Paper](https://gaugebench.ai/GaugeBench.pdf) (placeholder)

## Contributing

Contributions welcome! Please open issues or PRs.
