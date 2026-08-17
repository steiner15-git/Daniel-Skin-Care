const fs = require('fs');
const path = require('path');

let concatenated = '';

// Read all 7 chunk files
for (let i = 1; i <= 7; i++) {
  const num = String(i).padStart(2, '0');
  const file = path.join(__dirname, `chunk-${num}.txt.txt`);
  const content = fs.readFileSync(file, 'utf-8');
  
  // Remove first line (header) and last line (footer)
  const lines = content.split('\n');
  console.log(`File ${num}: ${lines.length} lines`);
  
  if (lines.length > 2) {
    concatenated += lines.slice(1, -1).join('\n') + '\n';
  }
}

// Show first 500 chars
console.log('\nFirst 500 chars:');
console.log(concatenated.substring(0, 500));

// Count FILE occurrences
const fileCount = (concatenated.match(/@@@@@ FILE:/g) || []).length;
console.log(`\nTotal FILE markers: ${fileCount}`);
