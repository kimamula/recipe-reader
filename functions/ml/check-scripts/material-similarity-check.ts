import { createKuromojiTokenizer } from '../lib/kuromoji';
import { getVector, loadWord2vecModel } from '../lib/word2vec';
import { normalizeString } from '../lib/normalize';
import { truthyFilter } from '../lib/util';
import { calcMaterialScore } from '../lib/infer';

const materialStat = require('../data/material-stat.json') as { [key in 'name' | 'quantity']: { [label in 'correct' | 'others']: { avg: number; sd: number; }; }; };
const materialVector = require('../data/material-vector.json') as { [key in 'name' | 'quantity']: number[]; };

const word = process.argv[2];

Promise.all([createKuromojiTokenizer(), loadWord2vecModel()]).then(([tokenizer, model]) => {
  const vectors = getVector(tokenizer, model, normalizeString(word)).filter(truthyFilter);
  if (vectors.length === 0) {
    return console.log(`Failed to calcurate vector for ${word}`);
  }
  const nameArray = vectors.map(vector => calcMaterialScore(vector, materialVector.name, materialStat.name));
  const quantityArray = vectors.map(vector => calcMaterialScore(vector, materialVector.quantity, materialStat.quantity));
  console.log('Similarity to material name', nameArray, nameArray.reduce((a, b) => a + b, 0));
  console.log('Similarity to material quantity', quantityArray, quantityArray.reduce((a, b) => a + b, 0));
});
