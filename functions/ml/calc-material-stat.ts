import { allSiteData, getMaterialsNameAndQuantity, SiteData } from './site-data';
import { JSDOM } from 'jsdom';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import {
  createKuromojiTokenizer,
  loadWord2vecModel,
  calcSimilarity,
  normalizeString
} from './common';

const materialVector = require('./data/material-vector.json') as { name: number[]; quantity: number[]; };
let correctNameAcc = { sum: 0, squaredSum: 0, count: 0 };
let correctQuantityAcc = Object.assign({}, correctNameAcc);
let othersNameAcc = Object.assign({}, correctNameAcc);
let othersQuantityAcc = Object.assign({}, correctNameAcc);
interface AccumulatedSimilarityData {
  sum: number;
  squaredSum: number;
  count: number;
}

interface SimilarityData {
  correct: number[];
  others: number[];
}

const dummyVector = {} as { values?: number[] };

Promise.all([createKuromojiTokenizer(), loadWord2vecModel()]).then(([tokenizer, model]) => {
  const wordMemo: { [word: string]: { name: number; quantity: number} | undefined; } = {};
  function getSimilarity(s?: string): { name: number[]; quantity: number[]; } {
    return (s ? tokenizer.tokenize(normalizeString(s)) : [])
      .reduce((acc, word) => {
        word = word.trim();
        if (word && !wordMemo.hasOwnProperty(word)) {
          const vector = (model.getVector(word) || dummyVector).values;
          wordMemo[word] = vector && {
            name: calcSimilarity(vector, materialVector.name),
            quantity: calcSimilarity(vector, materialVector.quantity),
          };
        }
        const memo = wordMemo[word];
        if (memo) {
          acc.name.push(memo.name);
          acc.quantity.push(memo.quantity);
        }
        return acc;
      }, { name: [], quantity: [] } as { name: number[]; quantity: number[]; });
  }
  async function getSimilarityDataForFile(siteData: SiteData, file: string): Promise<{ name: SimilarityData; quantity: SimilarityData; }> {
    return new Promise<{ name: SimilarityData; quantity: SimilarityData; }>((resolve, reject) => fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      const document = new JSDOM(data).window.document;
      document.querySelectorAll('style, script, noscript, img').forEach(s => s.remove());
      const materials = Array.from(document.querySelectorAll(siteData.materials));
      const correct = materials.reduce((acc, material) => {
        material.remove();
        const { name, quantity } = getMaterialsNameAndQuantity(material, siteData);
        return {
          name: [...acc.name, ...getSimilarity(name).name],
          quantity: [...acc.quantity, ...getSimilarity(quantity).quantity],
        }
      }, { name: [], quantity: [] } as { name: number[]; quantity: number[]; });
      const { name, quantity } = getSimilarity((document.body.textContent || '').trim());
      resolve({
        name: { correct: correct.name, others: name },
        quantity: { correct: correct.quantity, others: quantity },
      });
    }));
  }
  return Promise
    .all(Object.keys(allSiteData).map(siteName => new Promise((resolve, reject) =>
      glob(`${path.resolve(__dirname, '..', 'recipes', siteName)}/*.html`, async (err, files) => {
        if (err) {
          return reject(err);
        }
        let count = 0;
        for (const file of files) {
          const { name, quantity } = await getSimilarityDataForFile(allSiteData[siteName], file);
          correctNameAcc = addSimilarityData(correctNameAcc, name.correct);
          correctQuantityAcc = addSimilarityData(correctQuantityAcc, quantity.correct);
          othersNameAcc = addSimilarityData(othersNameAcc, name.others);
          othersQuantityAcc = addSimilarityData(othersQuantityAcc, quantity.others);
          count += 1;
          count % 100 === 0 && console.log(`Finished processing ${count}th file of ${siteName}`);
        }
        resolve();
      })
    )))
    .then(() => new Promise((resolve, reject) =>
      fs.writeFile(path.resolve(__dirname, 'data', 'material-stat.json'), JSON.stringify({
        name: {
          correct: createStatData(correctNameAcc),
          others: createStatData(othersNameAcc)
        },
        quantity: {
          correct: createStatData(correctQuantityAcc),
          others: createStatData(othersQuantityAcc)
        }
      }, null, 2), 'utf8', err => err ? reject(err) : resolve())
    ))
    .catch(err => console.error(err));
});

function addSimilarityData(acc: AccumulatedSimilarityData, newData: number[]): AccumulatedSimilarityData {
  return newData.reduce(({ sum, squaredSum, count }, similarity) => ({
    sum: sum + similarity,
    squaredSum: squaredSum + Math.pow(similarity, 2),
    count: count + 1
  }), acc);
}

function createStatData({ sum, squaredSum, count }: AccumulatedSimilarityData): { avg: number; sd: number; } {
  const avg = sum / count;
  return { avg, sd: Math.sqrt((squaredSum / (count - 1)) - Math.pow(avg, 2) * count / (count - 1)) };
}