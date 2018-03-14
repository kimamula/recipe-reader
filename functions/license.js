const nlf = require('nlf');
const fs = require('fs');
const path = require('path');

nlf.find({ directory: __dirname, production: true }, (err, data) => {
  if (err) {
    return console.error(err);
  }
  data = data.filter(({ id }) => id !== 'functions@0.0.0');
  data.forEach(entry => {
    delete entry.directory;
    entry.licenseSources.license.sources.forEach(source => delete source.filePath);
    entry.licenseSources.readme.sources.forEach(source => delete source.filePath);
  });
  fs.writeFile(path.resolve(__dirname, 'license.json'), JSON.stringify(data, null, 2), 'utf8', err => err && console.error(err))
});