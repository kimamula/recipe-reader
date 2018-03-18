import path from 'path';
import { TokenizerWrapper } from './kuromoji';

export async function loadWord2vecModel(): Promise<Word2vecModel> {
  return new Promise<Word2vecModel>((resolve, reject) => {
    const word2vec: Word2vec = require('word2vec');
    word2vec.loadModel(
      path.resolve(__dirname, '../data/word2vec.model.txt'),
      (err, model) => err ? reject(err) : resolve(model)
    );
  });
}

export const dummyVector = {} as { values?: number[] };

export function computeSumOfVectors(vectors: number[][]): number[] {
  return vectors.reduce((sum, vector) => sum.map((v, i) => v + vector[i]));
}
export function normalizeVector(vector: number[]): number[] {
  const abs = Math.sqrt(vector.reduce((square, v) => square + v * v, 0));
  return vector.map(v => v / abs);
}

export function getVector(tokenizer: TokenizerWrapper, model: Word2vecModel, s?: string): (number[] | undefined)[] {
  if (!s) {
    return [];
  }
  return tokenizer.tokenize(s)
    .reduce((acc, word) => {
      word = word.trim();
      if (word) {
        acc.push((model.getVector(word) || dummyVector).values);
      }
      return acc;
    }, [] as (number[] | undefined)[]);
}

export function calcSimilarity(vector1: number[], vector2: number[]): number {
  return vector1.reduce((similarity, v, i) => similarity + v * vector2[i], 0);
}