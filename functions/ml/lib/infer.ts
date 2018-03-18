import { TokenizerWrapper } from './kuromoji';
import { DeeplearnModel } from './deeplearn';
import { truthyFilter } from './util';
import { calcSimilarity, computeSumOfVectors, dummyVector, getVector, normalizeVector } from './word2vec';
import { normalizeString } from './normalize';

const startsWithNumberRegex = /^\d/;

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
export async function infer(
  tokenizer: TokenizerWrapper,
  model: Word2vecModel,
  deeplearnModel: DeeplearnModel,
  document: Document,
  materialVector: { [key in 'name' | 'quantity']: number[]; },
  materialStat: { [key in 'name' | 'quantity']: { [label in 'correct' | 'others']: { avg: number; sd: number; }; }; },
): Promise<{ materials: { [name: string]: string; }, procedures: string[] }> {
  const wordMemo: { [word: string]: { name: number; quantity: number; vector: number[] | undefined; } } = {};
  const calcMaterialScores = (vector: number[]) => ({
    name: calcMaterialScore(vector, materialVector.name, materialStat.name),
    quantity: calcMaterialScore(vector, materialVector.quantity, materialStat.quantity),
  });
  const calcProcedureScore = async (input: number[]) =>
    deeplearnModel.predict(input).then(output => (output - 0.5) * 2);
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
            const { name, quantity } = vector ? calcMaterialScores(vector) : zeroMaterialScore;
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
    let simpleSum = Number.NEGATIVE_INFINITY, score = Number.NEGATIVE_INFINITY, name = '', quantity = '';
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
      const _simpleSum = nameScore + quantityScore;
      const _score = (nameScore / nameCount) + (quantityScore / quantityCount);
      // Compare simple sum as otherwise a word which is more similar to material name is used as material quantity (and vice versa) in some situation.
      if (_simpleSum > simpleSum) {
        simpleSum = _simpleSum;
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