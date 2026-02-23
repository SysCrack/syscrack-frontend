/**
 * Run QA Suite based on DDIA requirements.
 * Usage: npx tsx scripts/run-qa-suite.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runQaSuite } from '../src/lib/simulation/qaSuite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const results = runQaSuite();
let allPassed = true;
let passedCount = 0;

console.log('--- SysCrack Sandbox QA Suite ---');
for (const result of results) {
    if (result.passed) {
        console.log(`[PASS] ${result.id} - ${result.name}`);
        passedCount++;
    } else {
        console.log(`[FAIL] ${result.id} - ${result.name}`);
        for (const failure of result.failures) {
            console.log(`       -> ${failure}`);
        }
        allPassed = false;
    }
}

console.log('---------------------------------');
console.log(`Result: ${passedCount} / ${results.length} passed.`);

if (!allPassed) {
    process.exit(1);
} else {
    process.exit(0);
}
