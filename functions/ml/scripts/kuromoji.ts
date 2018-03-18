import { allSiteData } from '../lib/site-data';
import glob from 'glob';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { createKuromojiTokenizer, TokenizerWrapper } from '../lib/kuromoji';

const recipesDir = path.resolve(__dirname, '../../recipes');

createKuromojiTokenizer().then(tokenizer => {
  const writeStream = fs.createWriteStream(path.resolve(recipesDir, 'kuromojied.txt'), 'utf8');
  return Promise
    .all(Object.keys(allSiteData).map(siteName => new Promise((resolve, reject) => {
      glob(`${path.resolve(recipesDir, siteName)}/*.txt`, async (err, files) => {
        if (err) {
          return reject(err);
        }
        let count = 0;
        for (const file of files) {
          writeStream.write(await processFile(tokenizer, file));
          writeStream.write('\n');
          count += 1;
          count % 100 === 0 && console.log(`Finished processing ${count}th file of ${siteName}`);
        }
      });
    })))
    .then(() => writeStream.end())
    .catch(err => console.error(err))
  }
);

async function processFile(tokenizer: TokenizerWrapper, file: string): Promise<string> {
  const results: string[] = [];
  return new Promise<string>((resolve, reject) => readline
    .createInterface({ input: fs.createReadStream(file) })
    .on('line', line =>
      results.push(tokenizer.tokenize(line).join(' '))
    )
    .on('close', () => resolve(results.join('\n')))
    .on('error', err => reject(err))
  );
}