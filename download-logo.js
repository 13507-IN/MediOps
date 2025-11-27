const https = require('https');
const fs = require('fs');
const path = require('path');

const logoUrl = 'https://i.ibb.co/x8ts2yqG/mediops-logo.png';
const outputPath = path.join(__dirname, 'frontend', 'public', 'logo.png');

const file = fs.createWriteStream(outputPath);

https.get(logoUrl, (response) => {
  if (response.statusCode === 200) {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Logo downloaded successfully!');
      // Create favicon
      const faviconPath = path.join(__dirname, 'frontend', 'public', 'favicon.ico');
      fs.copyFile(outputPath, faviconPath, (err) => {
        if (err) throw err;
        console.log('Favicon created successfully!');
      });
    });
  } else {
    console.error(`Failed to download logo. Status code: ${response.statusCode}`);
  }
}).on('error', (err) => {
  console.error('Error downloading logo:', err);
});
