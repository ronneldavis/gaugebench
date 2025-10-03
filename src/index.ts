#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { parseFile } from '@fast-csv/parse';
import { format as csvFormat } from '@fast-csv/format';
import chalk from 'chalk';
import boxen from 'boxen';

const program = new Command();

program
  .name('gaugebench')
  .description('CLI to run GaugeBench benchmark on models via OpenRouter')
  .version('1.0.0');

program
  .command('run')
  .description('Run the benchmark')
  .action(async () => {
    // Display title
    console.log(boxen(chalk.bold.magenta('GaugeBench'), { padding: 1, margin: 1, borderStyle: 'double' }));
    console.log(chalk.blue('Visual Reasoning Benchmark for Analog Gauges\n'));

    // Check API keys
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    const openAiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';

    const available: string[] = [];
    if (openRouterKey) available.push('openrouter');
    if (openAiKey) available.push('openai');

    if (available.length === 0) {
      console.error(chalk.red('❌ No API keys found. Set OPENROUTER_API_KEY or OPENAI_API_KEY.'));
      process.exit(1);
    }

    let apiType: string;
    if (available.length === 1) {
      apiType = available[0]!;
      console.log(chalk.green(`✓ Using ${apiType === 'openrouter' ? 'OpenRouter' : 'OpenAI'} (only available option)`));
    } else {
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'api',
        message: chalk.cyan('Which API would you like to use?'),
        choices: available.map(a => ({ name: a === 'openrouter' ? 'OpenRouter' : 'OpenAI', value: a })),
      }]);
      apiType = answer.api;
    }

    // Prompt for model ID
    const modelAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'modelId',
        message: chalk.cyan('Enter the model ID:'),
        validate: (input) => input.length > 0 || chalk.red('Model ID is required'),
      },
    ]);

    const modelId = modelAnswer.modelId;

    // Read ground truth
    const groundTruth: { [filename: string]: { min_value: number, max_value: number, reading_value: number, units: string } } = {};
    const outputsPath = path.join(process.cwd(), 'outputs.csv');
    if (!await fs.pathExists(outputsPath)) {
      console.error('outputs.csv not found in current directory');
      process.exit(1);
    }

    const rows: any[] = [];
    await new Promise((resolve, reject) => {
      parseFile(outputsPath, { headers: true })
        .on('data', (row: any) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });
    for (const row of rows) {
      groundTruth[row.filename] = {
        min_value: parseFloat(row.min_value),
        max_value: parseFloat(row.max_value),
        reading_value: parseFloat(row.reading_value),
        units: row.units,
      };
    }

    // Get list of input images
    const inputsDir = path.join(process.cwd(), 'inputs');
    if (!await fs.pathExists(inputsDir)) {
      console.error('inputs folder not found');
      process.exit(1);
    }

    const files = await fs.readdir(inputsDir);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    // Create test_outputs folder
    const testOutputsDir = path.join(process.cwd(), 'test_outputs');
    await fs.ensureDir(testOutputsDir);

    // Process each image in parallel
    const promises = imageFiles.map(file => processImage(file, modelId, inputsDir, apiType, openAiUrl));
    const responses = await Promise.all(promises);

    // Write individual CSV
    const csvStream = csvFormat({ headers: ['filename', 'min_value', 'max_value', 'reading_value', 'units'] });
    csvStream.pipe(fs.createWriteStream(path.join(testOutputsDir, `${modelId}.csv`)));
    for (const record of responses) {
      csvStream.write(record);
    }
    csvStream.end();
    await new Promise((resolve) => csvStream.on('finish', resolve));

    // Calculate score
    let correct = 0;
    responses.forEach((res: any) => {
      const gt = groundTruth[res.filename];
      if (gt && res.reading_value === gt.reading_value && res.units === gt.units) {
        correct++;
      }
    });
    const score = (correct / imageFiles.length) * 100;

    // Get model creator
    const modelCreator = await getModelCreator(modelId, apiType);

    // Update consolidated CSV
    const consolidatedPath = path.join(testOutputsDir, 'test_outputs_consolidated.csv');
    let consolidatedRows: any[] = [];
    if (await fs.pathExists(consolidatedPath)) {
      await new Promise((resolve, reject) => {
        parseFile(consolidatedPath, { headers: true })
          .on('data', (row: any) => consolidatedRows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });
    }
    consolidatedRows.push({ model_id: modelId, model_creator: modelCreator, score });

    const consolidatedStream = csvFormat({ headers: ['model_id', 'model_creator', 'score'] });
    consolidatedStream.pipe(fs.createWriteStream(consolidatedPath));
    for (const record of consolidatedRows) {
      consolidatedStream.write(record);
    }
    consolidatedStream.end();
    await new Promise((resolve) => consolidatedStream.on('finish', resolve));

    console.log(`Benchmark completed. Results saved to ${modelId}.csv and consolidated.csv`);
  });

async function processImage(filename: string, modelId: string, inputsDir: string, apiType: string, openAiUrl: string): Promise<any> {
  const imagePath = path.join(inputsDir, filename);
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = path.extname(filename).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

  const prompt = `Analyze this gauge image. Return a JSON object with the following fields: min_value (number), max_value (number), reading_value (number), units (string). Only return the JSON, no other text.`;

  let url: string, auth: string;
  if (apiType === 'openai') {
    url = openAiUrl;
    auth = `Bearer ${process.env.OPENAI_API_KEY}`;
  } else {
    url = 'https://openrouter.ai/api/v1/chat/completions';
    auth = `Bearer ${process.env.OPENROUTER_API_KEY}`;
  }

  const response = await axios.post(url, {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
  }, {
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
  });

  const content = response.data.choices[0].message.content;
  try {
    const parsed = JSON.parse(content);
    return {
      filename,
      min_value: parsed.min_value,
      max_value: parsed.max_value,
      reading_value: parsed.reading_value,
      units: parsed.units,
    };
  } catch (e) {
    console.error(`Failed to parse response for ${filename}: ${content}`);
    return { filename, min_value: null, max_value: null, reading_value: null, units: null };
  }
}

async function getModelCreator(modelId: string, apiType: string): Promise<string> {
  if (apiType === 'openai') return 'OpenAI';
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });
    const model = response.data.data.find((m: any) => m.id === modelId);
    return model ? model.name.split('/')[0] : 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

program.parse();
