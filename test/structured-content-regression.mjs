#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 Cellosaurus Structured Content Regression Tests${RESET}`);

// Code Mode-only server — the four tools come from createSearchTool,
// createExecuteTool, createQueryDataHandler, and createGetSchemaHandler
// in @bio-mcp/shared, which already emit content + structuredContent on both
// success and error paths. These assertions verify the wiring is correct.
const toolExpectations = [
  {
    path: 'src/tools/code-mode.ts',
    required: ['createSearchTool', 'createExecuteTool', 'cellosaurus', 'cellosaurusCatalog'],
  },
  {
    path: 'src/tools/query-data.ts',
    required: ['createQueryDataHandler', 'cellosaurus_query_data'],
  },
  {
    path: 'src/tools/get-schema.ts',
    required: ['createGetSchemaHandler', 'cellosaurus_get_schema'],
  },
];

for (const { path: filePath, required } of toolExpectations) {
  const content = readFile(filePath);
  for (const token of required) {
    assertContains(filePath, content, token, `${filePath} includes ${token}`);
  }
}

// Provenance: cellosaurus_execute must declare the Cellosaurus source (CC BY 4.0)
const codeModeContent = readFile('src/tools/code-mode.ts');
assertContains('src/tools/code-mode.ts', codeModeContent, 'source:', 'code-mode declares a provenance source');
assertContains('src/tools/code-mode.ts', codeModeContent, 'CC BY 4.0', 'provenance source carries the CC BY 4.0 license');
assertContains('src/tools/code-mode.ts', codeModeContent, 'https://www.cellosaurus.org', 'provenance source url is cellosaurus.org');

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'CellosaurusDataDO', 'index.ts exports CellosaurusDataDO');
assertContains('src/index.ts', indexContent, 'McpAgent', 'index.ts uses McpAgent');
assertContains('src/index.ts', indexContent, 'registerCodeMode', 'index.ts wires registerCodeMode');
assertContains('src/index.ts', indexContent, 'registerQueryData', 'index.ts wires registerQueryData');
assertContains('src/index.ts', indexContent, 'registerGetSchema', 'index.ts wires registerGetSchema');

// Catalog sanity — must hit all three curated categories
const catalogContent = readFile('src/spec/catalog.ts');
for (const category of ['cell-line', 'search', 'release']) {
  assertContains(
    'src/spec/catalog.ts',
    catalogContent,
    `category: "${category}"`,
    `catalog covers category "${category}"`,
  );
}
assertContains('src/spec/catalog.ts', catalogContent, 'cell-line-list', 'catalog notes teach the response envelope');
assertContains('src/spec/catalog.ts', catalogContent, 'fields=', 'catalog notes teach field selection');

// http.ts must request JSON explicitly; api-adapter must handle non-JSON formats
const httpContent = readFile('src/lib/http.ts');
assertContains('src/lib/http.ts', httpContent, 'api.cellosaurus.org', 'http.ts targets the Cellosaurus base URL');
assertContains('src/lib/http.ts', httpContent, 'Accept', 'http.ts sets Accept header (JSON)');

const adapterContent = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', adapterContent, 'content-type', 'api-adapter checks content-type');
assertContains('src/lib/api-adapter.ts', adapterContent, 'text', 'api-adapter surfaces non-JSON as { text }');

// do.ts staging hints must unwrap the Cellosaurus envelope
const doContent = readFile('src/do.ts');
assertContains('src/do.ts', doContent, 'RestStagingDO', 'do.ts extends RestStagingDO');
assertContains('src/do.ts', doContent, 'cell-line-list', 'do.ts inspects the cell-line-list array');

// wrangler.jsonc must bind CELLOSAURUS_DATA_DO and use port 8906
const wranglerContent = readFile('wrangler.jsonc');
assertContains('wrangler.jsonc', wranglerContent, 'CELLOSAURUS_DATA_DO', 'wrangler.jsonc binds CELLOSAURUS_DATA_DO');
assertContains('wrangler.jsonc', wranglerContent, 'CellosaurusDataDO', 'wrangler.jsonc migrates CellosaurusDataDO class');
assertContains('wrangler.jsonc', wranglerContent, '"port": 8906', 'wrangler.jsonc dev port is 8906');
assertContains('wrangler.jsonc', wranglerContent, 'CODE_MODE_LOADER', 'wrangler.jsonc binds CODE_MODE_LOADER');
assertContains('wrangler.jsonc', wranglerContent, './src/ai-stub.ts', 'wrangler.jsonc aliases ai to the stub');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ Cellosaurus structured content regression tests passed.${RESET}`);
