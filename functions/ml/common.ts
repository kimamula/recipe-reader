import * as path from 'path';
import kuromoji, { IpadicFeatures, Tokenizer } from 'kuromoji';
import { performance } from 'perf_hooks';

const startsWithNumberRegex = /^\d/;
const tokenizeInterruptionNumberTarget = /^\d+$/;
const tokenizeInterruptionSymbolTarget = /^[:/,.]$/;
const tokenizeInterruptionTarget = /(^\d+$)|(^[:/,.]$)/;
export class TokenizerWrapper {
  tokenize(text: string): string[] {
    // prevent words like "1,000", "2.5" or "12/26" to be separated by symbols inside them.
    const tokenized = this.tokenizer.tokenize(text);
    const length = tokenized.length;
    return tokenized.reduce((acc, { surface_form }, i) => {
      const match = surface_form.match(tokenizeInterruptionTarget);
      if (!match) {
        return [...acc, surface_form];
      }
      if (match[1]) {
        if (tokenizeInterruptionNumberTarget.test(tokenized[i - 1] && tokenized[i - 1].surface_form)
          || tokenizeInterruptionSymbolTarget.test(tokenized[i - 1] && tokenized[i - 1].surface_form)
          && tokenizeInterruptionNumberTarget.test(tokenized[i - 2] && tokenized[i - 2].surface_form)) {
          // number following another number should be filtered
          return acc;
        }
        let immediatelyAfterSymbol = false;
        while (i < length - 1) {
          i += 1;
          const next = tokenized[i];
          if (tokenizeInterruptionNumberTarget.test(next.surface_form)) {
            immediatelyAfterSymbol = false;
            surface_form += next.surface_form;
            continue;
          }
          if (immediatelyAfterSymbol) {
            surface_form = surface_form.slice(0, -1);
            break;
          }
          if (tokenizeInterruptionSymbolTarget.test(next.surface_form)) {
            immediatelyAfterSymbol = true;
            surface_form += next.surface_form;
            continue;
          }
          break;
        }
        return [...acc, surface_form];
      }
      if (match[2]) {
        // Symbols between number should be filtered
        return tokenizeInterruptionNumberTarget.test(tokenized[i - 1] && tokenized[i - 1].surface_form)
        && tokenizeInterruptionNumberTarget.test(tokenized[i + 1] && tokenized[i + 1].surface_form)
          ? acc : [...acc, surface_form];
      }
      throw new Error('Unreachable');
    }, [] as string[]);
  }

  constructor(public tokenizer: Tokenizer<IpadicFeatures>) { }
}
export async function createKuromojiTokenizer(): Promise<TokenizerWrapper> {
  return new Promise<TokenizerWrapper>((resolve, reject) => kuromoji
    .builder({ dicPath: path.resolve(__dirname, '../node_modules/kuromoji/dict/') })
    .build((err, tokenizer) => err ? reject(err) : resolve(new TokenizerWrapper(tokenizer)))
  );
}

export async function loadWord2vecModel(): Promise<Word2vecModel> {
  return new Promise<Word2vecModel>((resolve, reject) => {
    const word2vec: Word2vec = require('word2vec');
    word2vec.loadModel(
      path.resolve(__dirname, 'data', 'word2vec.model.txt'),
      (err, model) => err ? reject(err) : resolve(model)
    );
  });
}

const dummyVector = {} as { values?: number[] };

export function truthyFilter<T>(v: T | undefined | null): v is T {
  return !!v;
}
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

const replaceMap = {
  'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
  'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
  'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
  'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
  'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
  'ｳﾞ': 'ヴ', 'ﾜﾞ': 'ヷ', 'ｦﾞ': 'ヺ',
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
  'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
  '｡': '。', '､': '、', 'ｰ': 'ー', '｢': '「', '｣': '」',
  '㌘': 'グラム', '㌔': 'キロ', '㏄': 'cc', '　': ' ',
} as { [target: string]: string; };
const regExpStr = `([！-～])|(${Object.keys(replaceMap).join('|')})`;
export function normalizeString(str: string): string {
  return str
    .replace(new RegExp(regExpStr, 'g'), (match, $1?: string, $2?: string) => {
      if ($1) {
        return String.fromCharCode($1.charCodeAt(0) - 0xFEE0);
      }
      if ($2) {
        return replaceMap[$2];
      }
      return match;
    })
    .replace(/([A-Z]+)|([^ ] *)([:…])( *[^ ])/g, (match, $1?: string, $2?: string, $3?: string, $4?: string) => {
      if ($1) {
        return $1.toLowerCase();
      }
      if ($2 && $3 && $4) {
        // remove delimiter-like symbol as it may appear between material name and quantity and interrupt inferring
        return $2.match(/\d/) && $4.match(/\d/) ? match : $2 + $4;
      }
      return match;
    });
}

export interface ProcedureLeaningData {
  input: number[][];
  output: number[];
}

interface NodeData {
  textContent: string;
  startsWithNumber: number;
  materialSimilarity: {
    name: number;
    quantity: number;
    pair: {
      score: number;
      name: string;
      quantity: string;
    } | null;
    listOfPairs: {
      score: number;
      pairs: { [name: string]: string; };
    };
  };
  procedureSimilarity: {
    score: number;
    procedures: string[];
  }
  vectors: (number[] | undefined)[];
}
function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE;
}
function isText(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE;
}
export async function inferMaterialsAndProcedures(
  tokenizer: TokenizerWrapper,
  model: Word2vecModel,
  document: Document,
  calcMaterialScore: (vector: number[]) => { name: number; quantity: number; },
  calcProcedureScore: (procedureVector: number[]) => Promise<number>,
): Promise<{ materials: { [name: string]: string; }, procedures: string[] }> {
  const wordMemo: { [word: string]: { name: number; quantity: number; vector: number[] | undefined; } } = {};
  let procedures: string[] = [];
  let materials: { [name: string]: string; } = {};
  let maxProceduresScore = Number.NEGATIVE_INFINITY;
  let maxMaterialsScore = Number.NEGATIVE_INFINITY;
  const zeroMaterialScore = { name: 0, quantity: 0 };

  async function visitNode(node: Node): Promise<NodeData | null> {
    if (!isElement(node) && !isText(node)) {
      return null;
    }
    let result: NodeData;
    if (isText(node) || node.children.length === 0) {
      const normalizedTextContent = normalizeString((node.textContent || '').trim());
      if (!normalizedTextContent) {
        return null;
      }
      const scoresToCreatePairs: { name: number; quantity: number; textContent: string; count: 1 }[] = [];
      result = tokenizer.tokenize(normalizedTextContent)
        .reduce((acc, word, i) => {
          word = word.trim();
          if (!word) {
            return acc;
          }
          const { textContent, startsWithNumber, materialSimilarity, procedureSimilarity, vectors } = acc;
          if (!wordMemo[word]) {
            const vector = (model.getVector(word) || dummyVector).values;
            const { name, quantity } = vector ? calcMaterialScore(vector) : zeroMaterialScore;
            wordMemo[word] = { name, quantity, vector };
          }
          const { name, quantity, vector } = wordMemo[word];
          scoresToCreatePairs.push({ name, quantity, textContent: word, count: 1 });
          return {
            textContent,
            startsWithNumber: i === 0 ? (startsWithNumberRegex.test(word) ? 1 : 0) : startsWithNumber,
            materialSimilarity: {
              name: materialSimilarity.name + name,
              quantity: materialSimilarity.quantity + quantity,
              pair: materialSimilarity.pair,
              listOfPairs: materialSimilarity.listOfPairs,
            },
            procedureSimilarity,
            vectors: vector ? [...vectors, vector] : vectors,
          }
        }, {
          textContent: normalizedTextContent,
          startsWithNumber: 0,
          materialSimilarity: { name: 0, quantity: 0, pair: null, listOfPairs: { score: 0, pairs: {} } },
          procedureSimilarity: { score: -1, procedures: [] },
          vectors: []
        } as NodeData);
      result.materialSimilarity.pair = createBestMaterialPair(scoresToCreatePairs);
      if (result.materialSimilarity.pair) {
        const { score, name, quantity } = result.materialSimilarity.pair;
        result.materialSimilarity.listOfPairs = { score, pairs: { [name]: quantity } };
      }
    } else {
      const nodeDataList = (await Promise.all(Array.from(node.childNodes).map(visitNode))).filter(truthyFilter);
      const length = nodeDataList.length;
      if (length === 0) {
        return null;
      }
      const pair = createBestMaterialPairFromNodeDataList(nodeDataList);
      const listOfPairs = createBestListOfMaterialPairs(nodeDataList);
      result = nodeDataList
        .reduce((acc, current, i) => ({
          textContent: `${acc.textContent} ${current.textContent}`,
          materialSimilarity: {
            name: acc.materialSimilarity.name + current.materialSimilarity.name,
            quantity: acc.materialSimilarity.quantity + current.materialSimilarity.quantity,
            pair,
            listOfPairs
          },
          procedureSimilarity: {
            score: acc.procedureSimilarity.score + current.procedureSimilarity.score,
            procedures: [...acc.procedureSimilarity.procedures, ...current.procedureSimilarity.procedures]
          },
          startsWithNumber: i === 1 ? acc.startsWithNumber : current.startsWithNumber,
          vectors: [...acc.vectors, ...current.vectors]
        }));
    }
    const length = result.vectors.length;
    if (length > 0 && result.materialSimilarity.listOfPairs.score > maxMaterialsScore) {
      maxMaterialsScore = result.materialSimilarity.listOfPairs.score;
      materials = result.materialSimilarity.listOfPairs.pairs;
    }
    if (isElement(node)) {
      const truthyVectors = result.vectors.filter(truthyFilter);
      const procedureScore = length && truthyVectors.length ? await calcProcedureScore([
        1 / length,
        result.startsWithNumber,
        ...normalizeVector(computeSumOfVectors(truthyVectors))
      ]) : 0;
      if (procedureScore >= result.procedureSimilarity.score) {
        result.procedureSimilarity.score = procedureScore;
        result.procedureSimilarity.procedures = [result.textContent];
      }
      if (result.procedureSimilarity.score > maxProceduresScore) {
        maxProceduresScore = result.procedureSimilarity.score;
        procedures = result.procedureSimilarity.procedures;
      }
    }
    return result;
  }
  function createBestMaterialPairFromNodeDataList(nodeDataList: NodeData[]): NodeData['materialSimilarity']['pair'] {
    if (nodeDataList.length === 1) {
      return nodeDataList[0].materialSimilarity.pair;
    }
    return createBestMaterialPair(nodeDataList.map(({ materialSimilarity, textContent, vectors }) =>
      ({ name: materialSimilarity.name, quantity: materialSimilarity.quantity, textContent, count: vectors.length })
    ));
  }
  function createBestMaterialPair(scores: { name: number; quantity: number; textContent: string; count: number; }[]): NodeData['materialSimilarity']['pair'] {
    const length = scores.length;
    if (length === 0) {
      return null;
    }
    if (length === 1) {
      const { name, quantity, textContent } = scores[0];
      return { score: name + quantity - 1, name: name >= quantity ? textContent : '', quantity: name >= quantity ? '' : textContent };
    }
    let boundaryIndex = -1;
    let score = Number.NEGATIVE_INFINITY, name = '', quantity = '';
    for (let i = 1; i < length; i++) {
      let nameScore = 0, nameCount = 0, quantityScore = 0, quantityCount = 0;
      for (let j = 0; j < length; j++) {
        const { name, quantity, count } = scores[j];
        if (j < i) {
          nameScore += name;
          nameCount += count;
        } else {
          quantityScore += quantity;
          quantityCount += count;
        }
      }
      const _score = (nameScore / nameCount) + (quantityScore / quantityCount);
      if (_score > score) {
        score = _score;
        boundaryIndex = i;
      }
    }
    if (boundaryIndex < 0) {
      return null;
    }
    for (let i = 0; i < length; i++) {
      const { textContent } = scores[i];
      if (i < boundaryIndex) {
        name += textContent;
      } else {
        quantity += textContent;
      }
    }
    return { score, name, quantity };
  }
  function createBestListOfMaterialPairs(nodeDataList: NodeData[]): NodeData['materialSimilarity']['listOfPairs'] {
    let scoreIfDirectChildrenArePairs = 0;
    let scoreIfDirectChildrenAreListOfPairs = 0;
    nodeDataList.forEach(({ materialSimilarity }) => {
      scoreIfDirectChildrenArePairs += (materialSimilarity.pair ? materialSimilarity.pair.score : 0);
      scoreIfDirectChildrenAreListOfPairs += materialSimilarity.listOfPairs.score;
    });
    return scoreIfDirectChildrenArePairs > scoreIfDirectChildrenAreListOfPairs
      ? {
        score: scoreIfDirectChildrenArePairs,
        pairs: nodeDataList.reduce((acc, { materialSimilarity }) => {
          if (materialSimilarity.pair) {
            acc[materialSimilarity.pair.name] = materialSimilarity.pair.quantity;
          }
          return acc;
        }, {} as { [name: string]: string; })
      }
      : {
        score: scoreIfDirectChildrenAreListOfPairs,
        pairs: nodeDataList.reduce((acc, { materialSimilarity }) =>
          ({ ...acc, ...materialSimilarity.listOfPairs.pairs })
        , {} as { [name: string]: string; })
      };
  }

  return visitNode(document.body).then(() => ({ materials, procedures }));
}
export function createProcedureInputVectorOfElement(tokenizer: TokenizerWrapper, model: Word2vecModel, element: Element): number[] | null {
  const normalizedTextContent = normalizeString((element.textContent || '').trim());
  const vector = getVector(tokenizer, model, normalizedTextContent);
  const truthyVector = vector.filter(truthyFilter);
  return truthyVector.length === 0 ? null : [
    1 / vector.length,
    startsWithNumberRegex.test(normalizedTextContent) ? 1 : 0,
    ...normalizeVector(computeSumOfVectors(truthyVector))
  ];
}

export function calcSimilarity(vector1: number[], vector2: number[]): number {
  return vector1.reduce((similarity, v, i) => similarity + v * vector2[i], 0);
}

function relativeDistribution(value: number, avg: number, sd: number): number {
  return Math.exp(-Math.pow(Math.abs(value - avg) / sd, 2) / 2)
}

export function calcMaterialScore(vector: number[], targetVector: number[], stat: { [label in 'correct' | 'others']: { avg: number; sd: number; }; }): number {
  const similarity = calcSimilarity(vector, targetVector);
  const relativeDistributionAsCorrect = relativeDistribution(similarity, stat.correct.avg, stat.correct.sd);
  const relativeDistributionAsOthers = relativeDistribution(similarity, stat.others.avg, stat.others.sd);
  const score0to1 = relativeDistributionAsCorrect / (relativeDistributionAsCorrect + relativeDistributionAsOthers);
  return (score0to1 - 0.5) * 2;
}

export class KerasModelWrapper {
  private running = false;
  private queue: { input: number[], resolve: (output: number) => any, reject: (err: any) => any }[] = [];
  constructor(private kerasModel: KerasJS.Model) { }

  ready(): Promise<void> {
    return this.kerasModel.ready();
  }

  predict(input: number[]): Promise<number> {
    return new Promise<number>(async (resolve, reject) => {
      this.queue.push({ input, resolve, reject });
      if (!this.running) {
        this.running = true;
        let head = this.queue.shift();
        while (head) {
          await this.kerasModel
            .predict({ input: new Float32Array(head.input) })
            .then(({ output }) => head!.resolve(output[0]), head.reject);
          head = this.queue.shift();
        }
        this.running = false;
      }
    });
  }
}

export async function infer(
  tokenizer: TokenizerWrapper,
  word2VecModel: Word2vecModel,
  kerasModelWrapper: KerasModelWrapper,
  document: Document,
  materialVector: { [key in 'name' | 'quantity']: number[]; },
  materialStat: { [key in 'name' | 'quantity']: { [label in 'correct' | 'others']: { avg: number; sd: number; }; }; },
): Promise<{ materials: { [name: string]: string; }, procedures: string[] }> {
  return inferMaterialsAndProcedures(
    tokenizer,
    word2VecModel,
    document,
    vector => ({
      name: calcMaterialScore(vector, materialVector.name, materialStat.name),
      quantity: calcMaterialScore(vector, materialVector.quantity, materialStat.quantity),
    }),
    input => kerasModelWrapper.predict(input).then(output => (output - 0.5) * 2)
  );
}