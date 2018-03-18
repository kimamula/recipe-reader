import { allSiteData, getMaterialsNameAndQuantity, SiteData } from '../lib/site-data';
import { JSDOM } from 'jsdom';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { createKuromojiTokenizer } from '../lib/kuromoji';
import { computeSumOfVectors, getVector, loadWord2vecModel, normalizeVector } from '../lib/word2vec';
import { normalizeString } from '../lib/normalize';
import { truthyFilter } from '../lib/util';

let materialNameVectors: number[][] = [];
let materialQuantityVectors: number[][] = [];

Promise.all([createKuromojiTokenizer(), loadWord2vecModel()]).then(([tokenizer, model]) => {
  async function getVectorsForFile(siteData: SiteData, file: string): Promise<{ name: number[][]; quantity: number[][]; }> {
    return new Promise<{ name: number[][]; quantity: number[][]; }>((resolve, reject) => fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      const dom = new JSDOM(data);
      resolve(Array.from(dom.window.document.querySelectorAll(siteData.materials)).reduce((acc, material) => {
        const { name, quantity } = getMaterialsNameAndQuantity(material, siteData);
        const nameVectors = getVector(tokenizer, model, name && normalizeString(name));
        const quantityVectors = getVector(tokenizer, model, quantity && normalizeString(quantity));
        return {
          name: [...acc.name, ...nameVectors.filter(truthyFilter)],
          quantity: [...acc.quantity, ...quantityVectors.filter(truthyFilter)]
        };
      }, { name: [], quantity: [] } as { name: number[][]; quantity: number[][]; }));
    }));
  }
  return Promise
    .all(Object.keys(allSiteData).map(siteName => new Promise((resolve, reject) =>
      glob(`${path.resolve(__dirname, '../../recipes', siteName)}/*.html`, async (err, files) => {
        if (err) {
          return reject(err);
        }
        let count = 0;
        for (const file of files) {
          const { name, quantity } = await getVectorsForFile(allSiteData[siteName], file);
          materialNameVectors = [...materialNameVectors, ...name];
          materialQuantityVectors = [...materialQuantityVectors, ...quantity];
          count += 1;
          count % 100 === 0 && console.log(`Finished processing ${count}th file of ${siteName}`);
        }
        resolve();
      })
    )))
    .then(() => new Promise((resolve, reject) =>
      fs.writeFile(path.resolve(__dirname, '../data/material-vector.json'), JSON.stringify({
        name: normalizeVector(computeSumOfVectors(materialNameVectors)),
        quantity: normalizeVector(computeSumOfVectors(materialQuantityVectors))
      }), 'utf8', err => err ? reject(err) : resolve())
    ))
    .catch(err => console.error(err));
});
