#!/usr/bin/env node

// The @OptimizedFunction Swift macro requires the ExpoModulesMacros compiler plugin to be
// wired into the Xcode project, which doesn't happen automatically in EAS managed builds.
// This script strips @OptimizedFunction annotations from native module Swift files so the
// compiler doesn't look for the plugin. The macro is a performance optimization only —
// removing it has no effect on correctness.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const nodeModules = path.join(__dirname, '..', 'node_modules');

try {
  const result = execSync(
    `grep -rn "@OptimizedFunction" "${nodeModules}" --include="*.swift" -l 2>/dev/null`,
    { encoding: 'utf8' }
  ).trim();

  if (!result) {
    console.log('No @OptimizedFunction usages found, nothing to patch.');
    process.exit(0);
  }

  const files = result.split('\n').filter(Boolean);

  for (const file of files) {
    // Skip the macro declaration file and plugin sources — only patch usage sites
    if (
      file.includes('expo-modules-core') ||
      file.includes('expo-modules-macros-plugin')
    ) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const patched = content.replace(/^\s*@OptimizedFunction\s*\n/gm, '');

    if (patched !== content) {
      fs.writeFileSync(file, patched, 'utf8');
      console.log(`Patched: ${path.relative(nodeModules, file)}`);
    }
  }

  console.log('Done patching @OptimizedFunction annotations.');
} catch (error) {
  // grep exits 1 when no matches — that's fine
  if (error.status === 1 && !error.stdout?.trim()) {
    console.log('No @OptimizedFunction usages found, nothing to patch.');
    process.exit(0);
  }
  console.error('Patch script error:', error.message);
  process.exit(1);
}
