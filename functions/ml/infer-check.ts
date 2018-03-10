import KerasJS from 'keras-js';
import { JSDOM } from 'jsdom';
import { createKuromojiTokenizer, infer, KerasModelWrapper, loadWord2vecModel } from './common';
import path from 'path';
import fs from 'fs';
import glob from 'glob';
import { allSiteData, getMaterialsNameAndQuantity } from './site-data';
import fetch from 'node-fetch';

const materialStat = require('./data/material-stat.json') as { [key in 'name' | 'quantity']: { [label in 'correct' | 'others']: { avg: number; sd: number; }; }; };
const materialVector = require('./data/material-vector.json') as { [key in 'name' | 'quantity']: number[]; };

const kerasModelWrapper = new KerasModelWrapper(new KerasJS.Model({ filepath: path.resolve(__dirname, 'data', 'procedure-model.bin'), filesystem: true }));

const siteNameOrURL = process.argv[2];
const count = Number(process.argv[3]) || 10;

const siteNames = Object.keys(allSiteData);

Promise
  .all([createKuromojiTokenizer(), loadWord2vecModel(), kerasModelWrapper.ready()])
  .then<any>(([tokenizer, word2VecModel]) => siteNames.indexOf(siteNameOrURL) >= 0
    ? new Promise(async (resolve, reject) =>
      glob(`${path.resolve(__dirname, '..', 'recipes', siteNameOrURL)}/*.html`, async (err, files) => {
        if (err) {
          return reject(err);
        }
        const siteData = allSiteData[siteNameOrURL];
        let _count = 0;
        for (const file of files) {
          const html = await new Promise<string>((resolve, reject) => fs.readFile(file, 'utf8', (err, data) => err ? reject(err) : resolve(data)));
          const document = new JSDOM(html).window.document;
          document.querySelectorAll('style, script, noscript').forEach(s => s.remove());
          const result = await infer(tokenizer, word2VecModel, kerasModelWrapper, document, materialVector, materialStat);
          const expectation = {
            materials: Array.from(document.querySelectorAll(siteData.materials)).reduce((acc, material) => {
              const { name, quantity } = getMaterialsNameAndQuantity(material, siteData);
              name && (acc[name] = quantity);
              return acc;
            }, {} as { [name: string]: string | undefined; }),
            procedures: Array.from(document.querySelectorAll(siteData.procedures)).map(({ textContent }) => textContent)
          };
          console.log('inferring result material', result.materials, expectation.materials);
          console.log('inferring result procedures', result.procedures, expectation.procedures);
          _count += 1;
          if (_count >= count) {
            break;
          }
        }
        resolve();
      })
    )
    : fetch(siteNameOrURL, { redirect: 'manual' })
      .then(res => res.ok ? res.text() : Promise.reject(res))
      .then(html => {
        const document = new JSDOM(html).window.document;
        document.querySelectorAll('style, script, noscript').forEach(s => s.remove());
        return infer(tokenizer, word2VecModel, kerasModelWrapper, document, materialVector, materialStat);
      })
      .then(result => console.log(result))
  );
