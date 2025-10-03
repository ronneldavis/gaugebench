# GaugeBench

GaugeBench is a visual reasoning benchmark that evaluates whether AI models can accurately read analog gauges - a task that is straightforward for humans but challenging for current frontier models.

## Installation

```bash
npm install -g @onvo-ai/gaugebench
```

## Environment Variables

Create a `.env` file in the project root with one or both of the following API keys:

```env
OPENROUTER_API_KEY=your_openrouter_key_here
OPENAI_API_KEY=your_openai_key_here
OPENAI_API_URL=https://api.openai.com/v1/chat/completions  # Optional
```

Or set them as environment variables in your shell.

## Usage

3. Run the benchmark:

```bash
gaugebench run
# Or with model specified:
gaugebench run --model your_model_id
```

## Supported APIs

- **OpenRouter**: Access to various vision models (e.g., `openai/gpt-4o`)
- **OpenAI**: Direct access to OpenAI models (e.g., `gpt-4o`)
{{ ... }}
## Website

View the leaderboard at [https://ronneldavis.github.io/gaugebench/](https://ronneldavis.github.io/gaugebench/)

## Paper

[Read the Paper](https://gaugebench.ai/GaugeBench.pdf) (placeholder)

## Contributing

Contributions welcome! Please open issues or PRs.
