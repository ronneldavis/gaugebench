# GaugeBench

GaugeBench is a visual reasoning benchmark that evaluates whether AI models can accurately read analog gauges - a task that is straightforward for humans but challenging for current frontier models.

## Installation

```bash
npm install -g @onvo-ai/gaugebench
```

## Usage

1. Place gauge images in the `inputs/` folder (e.g., `1.jpeg`, `2.png`).
2. Create `outputs.csv` with ground truth data: `filename,min_value,max_value,reading_value,units`.
3. Run the benchmark:

```bash
gaugebench run
```

Enter your OpenRouter model ID when prompted. The app will process all images and save results to `test_outputs/`.

## Website

View the leaderboard at [https://ronneldavis.github.io/gaugebench/](https://ronneldavis.github.io/gaugebench/)

## Paper

[Read the Paper](https://gaugebench.ai/GaugeBench.pdf) (placeholder)

## Contributing

Contributions welcome! Please open issues or PRs.
