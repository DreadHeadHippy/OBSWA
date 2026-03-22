#!/usr/bin/env node
/**
 * package.js
 *
 * Validates and packs the plugin into a .streamDeckPlugin distribution file.
 * Output is written to the project root by default.
 *
 * Usage: npm run package
 *        npm run package -- --output ./releases
 */

import { execSync }  from 'child_process';
import path          from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLUGIN_DIR = path.join(__dirname, '..', 'com.dreadheadhippy.obswa.sdPlugin');
const args       = process.argv.slice(2);

// Allow --output <dir> override
const outputIdx = args.indexOf('--output');
const outputArg = outputIdx !== -1 ? args[outputIdx + 1] : path.join(__dirname, '..');

const outputDir = path.resolve(outputArg);

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  // 1. Validate first — fail fast before creating any output
  run(`npx streamdeck validate "${PLUGIN_DIR}"`);

  // 2. Pack into .streamDeckPlugin
  run(`npx streamdeck pack "${PLUGIN_DIR}" --output "${outputDir}" --force`);

  console.log(`\n✓ Packed to ${outputDir}`);
} catch {
  // execSync already printed the error; exit with failure code
  process.exit(1);
}
