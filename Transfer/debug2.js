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
  if (lines.length > 2) {
    concatenated += lines.slice(1, -1).join('\n') + '\n';
  }
}

// Find first FILE marker
const fileStart = concatenated.indexOf('@@@@@ FILE:');
if (fileStart === -1) {
  console.log('No FILE marker found!');
} else {
  console.log(`First FILE marker at position ${fileStart}`);
  console.log('Context around first marker:');
  console.log(JSON.stringify(concatenated.substring(fileStart, fileStart + 200)));
  
  // Find the end marker
  const endMarkerStart = concatenated.indexOf('@@@@@ ENDFILE @@@@@', fileStart);
  if (endMarkerStart === -1) {
    console.log('\nNo ENDFILE marker found after first FILE marker!');
  } else {
    console.log(`\nFirst ENDFILE marker at position ${endMarkerStart}`);
    console.log('Context around ENDFILE:');
    console.log(JSON.stringify(concatenated.substring(endMarkerStart - 100, endMarkerStart + 50)));
  }
}
