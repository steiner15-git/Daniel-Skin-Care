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

// Parse FILE blocks - handle both LF and CRLF line endings
const fileBlocks = [];
const fileRegex = /@@@@@ FILE: (.+?) @@@@@\r?\n([\s\S]*?)\r?\n@@@@@ ENDFILE @@@@@/g;
let match;

while ((match = fileRegex.exec(concatenated)) !== null) {
  fileBlocks.push({
    path: match[1].trim(),
    content: match[2]
  });
}

console.log(`Found ${fileBlocks.length} file blocks to create`);

// Create all files
const parentDir = path.dirname(__dirname);
let createdCount = 0;
const createdFiles = [];

fileBlocks.forEach((block, index) => {
  try {
    const filePath = path.join(parentDir, block.path);
    const dir = path.dirname(filePath);
    
    // Create directories if needed
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(filePath, block.content, 'utf-8');
    createdCount++;
    createdFiles.push(block.path);
  } catch (err) {
    console.error(`Error creating ${block.path}: ${err.message}`);
  }
});

console.log(`\nCreated ${createdCount} files\n`);
console.log('Files created:');
createdFiles.sort().forEach(f => console.log(`  ${f}`));
