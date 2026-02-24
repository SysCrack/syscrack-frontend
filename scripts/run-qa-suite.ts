/**
 * Run QA suite and exit with code 1 if any test fails.
 * Usage: npx tsx scripts/run-qa-suite.ts
 *
 * Maps to syscrack-requirements.md §5 Test Cases (TC-001 through TC-064).
 */
import { runQaSuite } from '../src/lib/simulation/qaSuite';

const results = runQaSuite();
const failed = results.filter((r) => !r.passed);
const passed = results.filter((r) => r.passed);

console.log('\n=== SysCrack QA Suite ===\n');

for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.id}: ${r.name}`);
    if (!r.passed && r.failures.length > 0) {
        for (const f of r.failures) {
            console.log(`   └ ${f}`);
        }
    }
}

console.log(`\n${passed.length} passed, ${failed.length} failed (${results.length} total)\n`);

if (failed.length > 0) {
    process.exit(1);
}
