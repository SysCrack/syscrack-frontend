/**
 * Run baseline capture and write to baseline-traces.json.
 * Usage: npx tsx scripts/run-baseline-capture.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { captureBaseline } from '../src/lib/simulation/baselineCapture';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const baseline = captureBaseline();
const tracesDir = join(root, '..', 'traces');
mkdirSync(tracesDir, { recursive: true });
const outPath = join(tracesDir, 'dag-traces.json');
writeFileSync(outPath, JSON.stringify(baseline, null, 2), 'utf-8');
console.log(`DAG traces captured to ${outPath}`);
