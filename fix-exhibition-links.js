const fs = require('fs');
const path = require('path');

// Directory containing the filtered exhibition pages
const dir = './exhibitions/past/all';

// Get all HTML files in the directory
const files = fs.readdirSync(dir).filter(file => file.endsWith('.html'));

console.log(`Found ${files.length} files to process`);

files.forEach(file => {
  const filePath = path.join(dir, file);
  console.log(`\nProcessing: ${filePath}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changesMade = 0;

  // Fix 1: Replace exhibition links that are missing the /exhibitions/ prefix
  // Match href="/some-exhibition.html" but NOT href="//something" (those are external URLs)
  const exhibitionLinkRegex = /href="\/([^/][^"]+\.html)"/g;
  const beforeExhibitionFix = content;

  content = content.replace(exhibitionLinkRegex, (match, exhibitionPath) => {
    // Don't touch links that already start with exhibitions/ or are special paths like index.html
    if (exhibitionPath.startsWith('exhibitions/') ||
        exhibitionPath === 'index.html' ||
        exhibitionPath.startsWith('artists') ||
        exhibitionPath.startsWith('news') ||
        exhibitionPath.startsWith('gallery')) {
      return match;
    }
    changesMade++;
    return `href="/exhibitions/${exhibitionPath}"`;
  });

  if (beforeExhibitionFix !== content) {
    console.log(`  - Fixed exhibition links`);
  }

  // Fix 2: Replace relative date filter links with absolute paths
  const dateFilterRegex = /href="(all|2024-2022|2021-2019|2018-2016|2015-2013)\.html"/g;
  const beforeDateFix = content;

  content = content.replace(dateFilterRegex, (match, dateRange) => {
    changesMade++;
    return `href="/exhibitions/past/all/${dateRange}.html"`;
  });

  if (beforeDateFix !== content) {
    console.log(`  - Fixed date filter links`);
  }

  // Write the updated content back to the file
  if (changesMade > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Total changes: ${changesMade}`);
  } else {
    console.log(`  - No changes needed`);
  }
});

console.log('\n✓ All files processed!');
