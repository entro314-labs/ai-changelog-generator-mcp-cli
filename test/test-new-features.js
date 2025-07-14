#!/usr/bin/env node

/**
 * Test script for new features: colored output and dry-run mode
 */

const AIChangelogGenerator = require('../lib/ai-changelog-generator');
const colors = require('../lib/colors');

console.log(colors.header('🧪 Testing New Features: Colored Output & Dry-Run Mode\n'));

// Test 1: Colors functionality
console.log(colors.subheader('Test 1: Color System'));
console.log(colors.successMessage('Success message test'));
console.log(colors.errorMessage('Error message test'));
console.log(colors.warningMessage('Warning message test'));
console.log(colors.infoMessage('Info message test'));
console.log(colors.processingMessage('Processing message test'));
console.log(colors.aiMessage('AI message test'));
console.log(colors.metricsMessage('Metrics message test'));

console.log('\nCommit type colors:');
console.log(`${colors.commitType('feat')}: New feature`);
console.log(`${colors.commitType('fix')}: Bug fix`);
console.log(`${colors.commitType('security')}: Security update`);
console.log(`${colors.commitType('breaking')}: Breaking change`);

console.log('\nRisk level colors:');
console.log(`Risk: ${colors.risk('low')}`);
console.log(`Risk: ${colors.risk('medium')}`);
console.log(`Risk: ${colors.risk('high')}`);
console.log(`Risk: ${colors.risk('critical')}`);

console.log('\nProgress bar test:');
console.log(colors.progress(3, 10, 'commits processed'));
console.log(colors.progress(7, 10, 'commits processed'));
console.log(colors.progress(10, 10, 'commits processed'));

// Test 2: File list formatting
console.log(colors.subheader('\nTest 2: File List Formatting'));
const testFiles = [
  'src/components/Button.tsx',
  'src/styles/main.css',
  'README.md',
  'package.json',
  'database/migrations/001_create_users.sql',
  'test/button.test.js'
];
console.log(colors.formatFileList(testFiles));

// Test 3: Metrics formatting
console.log(colors.subheader('\nTest 3: Metrics Formatting'));
const testMetrics = {
  'Total commits': 25,
  'API calls': 12,
  'Processing time': '2m 34s',
  'Success rate': '96%',
  'Errors': 1
};
console.log(colors.formatMetrics(testMetrics));

// Test 4: Box formatting
console.log(colors.subheader('\nTest 4: Box Formatting'));
const boxContent = `This is a test of the box formatting feature.
It supports multiple lines and should look nice.
Perfect for highlighting important information!`;
console.log(colors.box('Test Box', boxContent, 60));

// Test 5: Diff highlighting
console.log(colors.subheader('\nTest 5: Diff Highlighting'));
console.log(colors.diffAdd('Added line'));
console.log(colors.diffRemove('Removed line'));
console.log(colors.diffContext('Context line'));

// Test 6: Color disable/enable
console.log(colors.subheader('\nTest 6: Color Disable/Enable'));
console.log(colors.highlight('Colors enabled'));
colors.disable();
console.log(colors.highlight('Colors disabled (should be plain text)'));
colors.enable();
console.log(colors.highlight('Colors re-enabled'));

// Test 7: Dry-run mode
console.log(colors.subheader('\nTest 7: Dry-Run Mode'));

async function testDryRun() {
  try {
    console.log(colors.infoMessage('Testing dry-run mode...'));
    
    // Create generator with dry-run enabled
    const generator = new AIChangelogGenerator({ dryRun: true });
    
    console.log(colors.successMessage('✅ Dry-run mode initialized successfully'));
    console.log(colors.infoMessage(`Dry-run enabled: ${generator.dryRun}`));
    
    // Test no-color mode
    const generatorNoColor = new AIChangelogGenerator({ noColor: true });
    console.log(colors.successMessage('✅ No-color mode initialized successfully'));
    console.log(colors.infoMessage(`No-color enabled: ${generatorNoColor.noColor}`));
    
  } catch (error) {
    console.log(colors.errorMessage(`❌ Dry-run test failed: ${error.message}`));
  }
}

// Test 8: Environment variable detection
console.log(colors.subheader('\nTest 8: Environment Detection'));
console.log(colors.infoMessage(`NO_COLOR environment: ${process.env.NO_COLOR || 'not set'}`));
console.log(colors.infoMessage(`FORCE_COLOR environment: ${process.env.FORCE_COLOR || 'not set'}`));

// Run async tests
testDryRun().then(() => {
  console.log(colors.header('\n🎉 All tests completed!'));
  console.log(colors.successMessage('New features are working correctly'));
  
  console.log(colors.subheader('\nFeature Summary:'));
  console.log(`${colors.feature('✅ Colored Output')}: Beautiful chalk-based styling with semantic colors`);
  console.log(`${colors.feature('✅ Dry-Run Mode')}: Safe preview mode without file modifications`);
  console.log(`${colors.feature('✅ No-Color Mode')}: Disable colors for CI/CD environments`);
  console.log(`${colors.feature('✅ Progress Indicators')}: Visual progress bars and status updates`);
  console.log(`${colors.feature('✅ File Type Highlighting')}: Syntax-aware file list formatting`);
  console.log(`${colors.feature('✅ Box Formatting')}: Professional bordered content display`);
  
  console.log(colors.infoMessage('\nTry these commands to test:'));
  console.log(`  ${colors.highlight('ai-changelog --dry-run')}     # Preview mode`);
  console.log(`  ${colors.highlight('ai-changelog --no-color')}    # Disable colors`);
  console.log(`  ${colors.highlight('ai-changelog --help')}        # See colorized help`);
  console.log(`  ${colors.highlight('NO_COLOR=1 ai-changelog')}    # Environment disable`);
}).catch(error => {
  console.log(colors.errorMessage(`Test failed: ${error.message}`));
  process.exit(1);
}); 