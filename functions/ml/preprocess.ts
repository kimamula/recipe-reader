import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { allSiteData, getMaterialsNameAndQuantity } from './site-data';
import glob from 'glob';
import { normalizeString } from './common';

/**
 * Convert recipe html to text by calling `document.body.textContent`.
 */

const recipesDir = path.resolve(__dirname, '..', 'recipes');

Object.keys(allSiteData).forEach(siteName => {
  const recipesDirForSite = path.resolve(recipesDir, siteName);
  const siteData = allSiteData[siteName];
  glob(`${recipesDirForSite}/*.html`, async (err, files) => {
    if (err) {
      return console.error(err);
    }
    let count = 0;
    for (const file of files) {
      count += 1;
      await new Promise((resolve, reject) => fs.readFile(path.resolve(recipesDirForSite, file), 'utf8', (err, data) => {
        if (err) {
          return reject(err);
        }
        const dom = new JSDOM(data);
        dom.window.document.querySelectorAll('style, script, noscript').forEach(s => s.remove());
        dom.window.document.querySelectorAll(siteData.materials).forEach(material => {
          const { name, quantity } = getMaterialsNameAndQuantity(material, siteData);
          name && quantity && (material.textContent = `使用する${name}の量は${quantity}です。`.replace(/\n/, ''));
        });
        fs.writeFile(
          path.resolve(recipesDirForSite, file.replace(/\.html$/, '.txt')),
          normalizeString((dom.window.document.body.textContent || '')
            .split(/\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .join('\n')),
          'utf8',
          err => err ? reject(err) : resolve()
        );
      })).catch(err => console.error(file, err));
      count % 100 === 0 && console.log(`Finished converting ${count}th recipe of ${siteName}`);
    }
  });
});