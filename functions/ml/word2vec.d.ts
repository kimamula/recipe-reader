interface Word2phraseParams {
  minCount?: number;
  threshold?: number;
  debug?: number;
  silent?: boolean;
}

interface Word2vecParams {
  size?: number;
  window?: number;
  sample?: number;
  hs?: number
  negative?: number;
  threads?: number;
  iter?: number;
  minCount?: number;
  alpha?: number;
  classes?: number;
  debug?: number;
  binary?: number;
  saveVocab?: string;
  readVocab?: string;
  cbow?: number;
  silent?: boolean;
}

interface Word2vec {
  word2phrase(input: string, output: string, params?: Word2phraseParams, callback?: (exitCode: number) => any): void;
  word2vec(input: string, output: string, params?: Word2vecParams, callback?: (exitCode: number) => any): void;
  loadModel(file: string, callback: (err: any, model: Word2vecModel) => any): void;
}

interface Word2vecSimilarity {
  word: string;
  dist: number;
}

interface Word2vecVector {
  word: string;
  values: number[];
}

interface Word2vecModel {
	words: number;
	size: number;
	similarity(word1: string, word2: string): number;
	mostSimilar(word: string, num?: number): Word2vecSimilarity[] | null;
	analogy(word: string, pair: [string, string], num?: number): Word2vecSimilarity[];
	getVector(word: string): Word2vecVector | null;
  getVectors(words: string[]): Word2vecVector[];
	getNearestWord(vector: Word2vecVector): Word2vecSimilarity;
	getNearestWords(vector: Word2vecVector, num?: number): Word2vecSimilarity[];
}

declare const word2vec: Word2vec;

declare module 'word2vec' {
  export = word2vec;
}