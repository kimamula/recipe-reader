import { allSiteData, getMaterialsNameAndQuantity, SiteData } from '../lib/site-data';
import { JSDOM } from 'jsdom';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { createKuromojiTokenizer } from '../lib/kuromoji';
import { calcSimilarity, loadWord2vecModel } from '../lib/word2vec';
import { normalizeString } from '../lib/normalize';

const materialVector = require('../data/material-vector.json') as { name: number[]; quantity: number[]; };
let correctNameAcc = { sum: 0, squaredSum: 0, count: 0 };
let correctQuantityAcc = Object.assign({}, correctNameAcc);
let othersNameAcc = Object.assign({}, correctNameAcc);
let othersQuantityAcc = Object.assign({}, correctNameAcc);
let nameWordCountsAcc = Object.assign({}, correctNameAcc);
let quantityWordCountsAcc = Object.assign({}, correctNameAcc);
interface AccumulatedSimilarityData {
  sum: number;
  squaredSum: number;
  count: number;
}

interface Data {
  /**
   * similarities of correct words
   */
  correct: number[];
  /**
   * similarities of other words
   */
  others: number[];
  /**
   * word counts composing correct groups of words
   */
  wordCounts: number[];
}

const dummyVector = {} as { values?: number[] };

Promise.all([createKuromojiTokenizer(), loadWord2vecModel()]).then(([tokenizer, model]) => {
  const wordMemo: { [word: string]: { name: number; quantity: number} | undefined; } = {};
  function getData(s?: string): { name: number[]; quantity: number[]; wordCount: number; } {
    return (s ? tokenizer.tokenize(normalizeString(s)) : [])
      .reduce((acc, word) => {
        word = word.trim();
        if (word) {
          acc.wordCount += 1;
          if (!wordMemo.hasOwnProperty(word)) {
            const vector = (model.getVector(word) || dummyVector).values;
            wordMemo[word] = vector && {
              name: calcSimilarity(vector, materialVector.name),
              quantity: calcSimilarity(vector, materialVector.quantity),
            };
          }
        }
        const memo = wordMemo[word];
        if (memo) {
          acc.name.push(memo.name);
          acc.quantity.push(memo.quantity);
        }
        return acc;
      }, { name: [], quantity: [], wordCount: 0 } as { name: number[]; quantity: number[]; wordCount: number; });
  }
  async function getDataForFile(siteData: SiteData, file: string): Promise<{ name: Data; quantity: Data; }> {
    return new Promise<{ name: Data; quantity: Data; }>((resolve, reject) => fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      const document = new JSDOM(data).window.document;
      document.querySelectorAll('style, script, noscript, img').forEach(s => s.remove());
      const materials = Array.from(document.querySelectorAll(siteData.materials));
      const result = materials.reduce((acc, material) => {
        material.remove();
        const { name, quantity } = getMaterialsNameAndQuantity(material, siteData);
        const dataOfName = getData(name);
        const dataOfQuantity = getData(quantity);
        return {
          name: {
            correct: [...acc.name.correct, ...dataOfName.name],
            others: [...acc.name.others, ...dataOfQuantity.name],
            wordCounts: [...acc.name.wordCounts, dataOfName.wordCount],
          },
          quantity: {
            correct: [...acc.quantity.correct, ...dataOfQuantity.quantity],
            others: [...acc.quantity.others, ...dataOfName.quantity],
            wordCounts: [...acc.quantity.wordCounts, dataOfQuantity.wordCount],
          },
        }
      }, { name: { correct: [], others: [], wordCounts: [] }, quantity: { correct: [], others: [], wordCounts: [] } } as { name: Data; quantity: Data; });
      const { name, quantity } = getData((document.body.textContent || '').trim());
      resolve({
        name: { correct: result.name.correct, others: [...result.name.others, ...name], wordCounts: result.name.wordCounts },
        quantity: { correct: result.quantity.correct, others: [...result.quantity.others, ...quantity], wordCounts: result.quantity.wordCounts },
      });
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
          const { name, quantity } = await getDataForFile(allSiteData[siteName], file);
          correctNameAcc = addSimilarityData(correctNameAcc, name.correct);
          correctQuantityAcc = addSimilarityData(correctQuantityAcc, quantity.correct);
          othersNameAcc = addSimilarityData(othersNameAcc, name.others);
          othersQuantityAcc = addSimilarityData(othersQuantityAcc, quantity.others);
          nameWordCountsAcc = addSimilarityData(nameWordCountsAcc, name.wordCounts);
          quantityWordCountsAcc = addSimilarityData(quantityWordCountsAcc, quantity.wordCounts);
          count += 1;
          count % 100 === 0 && console.log(`Finished processing ${count}th file of ${siteName}`);
        }
        resolve();
      })
    )))
    .then(() => new Promise((resolve, reject) =>
      fs.writeFile(path.resolve(__dirname, '../data/material-stat.json'), JSON.stringify({
        name: {
          correct: createStatData(correctNameAcc),
          others: createStatData(othersNameAcc),
          wordCounts: createStatData(nameWordCountsAcc),
        },
        quantity: {
          correct: createStatData(correctQuantityAcc),
          others: createStatData(othersQuantityAcc),
          wordCounts: createStatData(quantityWordCountsAcc),
        },
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