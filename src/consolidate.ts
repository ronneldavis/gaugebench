import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { parseFile } from '@fast-csv/parse';
import { format as csvFormat } from '@fast-csv/format';

export type ApiType = 'openrouter' | 'openai';

export interface GroundTruthEntry {
  filename: string;
  min_value: number;
  max_value: number;
  reading_value: number;
  units: string;
}

interface Metadata {
  model_id?: string;
  sanitized_model_id?: string;
  model_creator?: string;
  api_type?: ApiType;
  score?: number;
  evaluated_at?: string;
}

export async function loadGroundTruth(outputsPath: string): Promise<Record<string, GroundTruthEntry>> {
  const groundTruth: Record<string, GroundTruthEntry> = {};
  const rows: any[] = [];
  await new Promise((resolve, reject) => {
    parseFile(outputsPath, { headers: true })
      .on('data', (row: any) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  for (const row of rows) {
    groundTruth[row.filename] = {
      filename: row.filename,
      min_value: parseFloat(row.min_value),
      max_value: parseFloat(row.max_value),
      reading_value: parseFloat(row.reading_value),
      units: row.units,
    };
  }

  return groundTruth;
}

export async function getModelCreator(modelId: string, apiType: ApiType): Promise<string> {
  if (apiType === 'openai') {
    return 'OpenAI';
  }

  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });
    const model = response.data.data.find((m: any) => m.id === modelId);
    return model ? model.name.split('/')[0] : 'Unknown';
  } catch (error) {
    console.warn(`Warning: unable to fetch model creator for ${modelId}: ${error}`);
    return 'Unknown';
  }
}

async function loadMetadata(metaPath: string): Promise<Metadata | undefined> {
  try {
    if (await fs.pathExists(metaPath)) {
      return await fs.readJson(metaPath);
    }
  } catch (error) {
    console.warn(`Warning: failed to read metadata at ${metaPath}: ${error}`);
  }
  return undefined;
}

export async function consolidateResults(): Promise<void> {
  const cwd = process.cwd();
  const outputsPath = path.join(cwd, 'outputs.csv');
  if (!await fs.pathExists(outputsPath)) {
    console.error('outputs.csv not found in the current directory.');
    process.exit(1);
  }

  const groundTruth = await loadGroundTruth(outputsPath);
  const testOutputsDir = path.join(cwd, 'test_outputs');
  if (!await fs.pathExists(testOutputsDir)) {
    console.error('test_outputs directory not found. Run `gaugebench run` first.');
    process.exit(1);
  }

  const files = await fs.readdir(testOutputsDir);
  const modelCsvFiles = files.filter((f) => f.endsWith('.csv') && f !== 'test_outputs_consolidated.csv');

  const consolidatedRecords: { model_id: string; model_creator: string; score: number; units_accuracy: number }[] = [];

  for (const csvFile of modelCsvFiles) {
    const sanitizedId = csvFile.replace(/\.csv$/, '');
    const csvPath = path.join(testOutputsDir, csvFile);
    const metaPath = path.join(testOutputsDir, `${sanitizedId}.meta.json`);

    const meta = await loadMetadata(metaPath);
    const modelId = meta?.model_id ?? sanitizedId;
    let modelCreator = meta?.model_creator ?? 'Unknown';
    const apiType: ApiType = meta?.api_type ?? 'openrouter';

    const predictions: any[] = [];
    await new Promise((resolve, reject) => {
      parseFile(csvPath, { headers: true })
        .on('data', (row: any) => predictions.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    let correct = 0;
    let correctUnits = 0;
    predictions.forEach((row) => {
      const gt = groundTruth[row.filename];
      if (!gt) {
        return;
      }
      const readingValue = parseFloat(row.reading_value);
      const units = row.units;
      if (!Number.isNaN(readingValue) && readingValue === gt.reading_value && units === gt.units) {
        correct++;
      }
      if (units === gt.units) {
        correctUnits++;
      }
    });

    const score = predictions.length ? (correct / predictions.length) * 100 : 0;
    const unitsAccuracy = predictions.length ? (correctUnits / predictions.length) * 100 : 0;

    if (modelCreator === 'Unknown') {
      modelCreator = await getModelCreator(modelId, apiType);
    }

    consolidatedRecords.push({ model_id: modelId, model_creator: modelCreator, score, units_accuracy: unitsAccuracy });
  }

  const consolidatedPath = path.join(testOutputsDir, 'test_outputs_consolidated.csv');
  await fs.ensureDir(path.dirname(consolidatedPath));

  const consolidatedStream = csvFormat({ headers: ['model_id', 'model_creator', 'score', 'units_accuracy'] });
  consolidatedStream.pipe(fs.createWriteStream(consolidatedPath));
  consolidatedRecords.forEach((record) => consolidatedStream.write(record));
  consolidatedStream.end();
  await new Promise((resolve) => consolidatedStream.on('finish', resolve));

  console.log(`Recalculated scores for ${consolidatedRecords.length} model(s).`);
  console.log(`Updated consolidated leaderboard written to ${consolidatedPath}.`);
}
