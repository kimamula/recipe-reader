import { TokenizerWrapper } from './kuromoji';
import { DeeplearnModel } from './deeplearn';
import { truthyFilter } from './util';
import { calcSimilarity, computeSumOfVectors, dummyVector, getVector, normalizeVector } from './word2vec';
import { normalizeString } from './normalize';

const startsWithNumberRegex = /^\d/;
const excludeAsProcedureRegExp = /^((作|つく)り方|手順)$/;
const excludeAsMaterialRegExp =/^材料(\s*[(|（][^)|）]+[)|）])?$/;

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
    };
    listOfPairs: {
      score: number;
      pairs: { name: string; quantity: string; }[];
    };
  };
  procedureSimilarity: {
    score: number;
    procedures: string[];
  }
  vectors: (number[] | undefined)[];
  sumOfVectors?: number[];
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
  materialStat: { [key in 'name' | 'quantity']: { [label in 'correct' | 'others' | 'wordCounts']: { avg: number; sd: number; }; }; },
): Promise<{ materials: { [name: string]: string; }, procedures: string[] }> {
  const wordMemo: { [word: string]: { name: number; quantity: number; vector: number[] | undefined; } } = {};
  const calcMaterialScores = (vector: number[]) => ({
    name: calcMaterialScore(vector, materialVector.name, materialStat.name),
    quantity: calcMaterialScore(vector, materialVector.quantity, materialStat.quantity),
  });
  const calcProcedureScore = async (input: number[]) =>
    deeplearnModel.predict(input).then(output => (output - 0.5) * 2);
  let procedures: string[] = [];
  let materials: { name: string; quantity: string; }[] = [];
  let maxProceduresScore = Number.NEGATIVE_INFINITY;
  let maxMaterialsScore = Number.NEGATIVE_INFINITY;
  const zeroMaterialScore = { name: 0.5, quantity: 0.5 };

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
      const scoresToCreatePairs: { name: number; quantity: number; textContent: string; count: 1; }[] = [];
      const truthyVectors: number[][] = [];
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
          vector && truthyVectors.push(vector);
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
            vectors: [...vectors, vector],
          }
        }, {
          textContent: normalizedTextContent,
          startsWithNumber: 0,
          materialSimilarity: { name: 0, quantity: 0, pair: { score: 0, name: '', quantity: '' }, listOfPairs: { score: 0, pairs: [] } },
          procedureSimilarity: { score: -1, procedures: [] },
          vectors: []
        } as NodeData);
      result.materialSimilarity.pair = calcMaterialScoreAndPair(scoresToCreatePairs);
      const { score, name, quantity } = result.materialSimilarity.pair;
      result.materialSimilarity.listOfPairs = { score, pairs: [{ name, quantity }] };
      if (truthyVectors.length > 0) {
        result.sumOfVectors = computeSumOfVectors(truthyVectors);
      }
    } else {
      const nodeDataList = (await Promise.all(Array.from(node.childNodes).map(visitNode))).filter(truthyFilter);
      const length = nodeDataList.length;
      if (length === 0) {
        return null;
      }
      if (length === 1) {
        return nodeDataList[0];
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
          vectors: [...acc.vectors, ...current.vectors],
          sumOfVectors: acc.sumOfVectors && current.sumOfVectors
            ? computeSumOfVectors([acc.sumOfVectors, current.sumOfVectors])
            : (acc.sumOfVectors || current.sumOfVectors)
        }));
    }
    const length = result.vectors.length;
    if (length > 0 && result.materialSimilarity.listOfPairs.score > maxMaterialsScore) {
      maxMaterialsScore = result.materialSimilarity.listOfPairs.score;
      materials = result.materialSimilarity.listOfPairs.pairs;
    }
    if (length > 0 && result.sumOfVectors && !excludeAsProcedureRegExp.test(result.textContent)) {
      const procedureScore = await calcProcedureScore([
        1 / length,
        result.startsWithNumber,
        ...normalizeVector(result.sumOfVectors)
      ]);
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
    return calcMaterialScoreAndPair(nodeDataList.map(({ materialSimilarity, textContent, vectors }) =>
      ({ name: materialSimilarity.name, quantity: materialSimilarity.quantity, textContent, count: vectors.length })
    ));
  }
  function createBestListOfMaterialPairs(nodeDataList: NodeData[]): NodeData['materialSimilarity']['listOfPairs'] {
    let scoreIfDirectChildrenArePairs = 0;
    let scoreIfDirectChildrenAreListOfPairs = 0;
    nodeDataList.forEach(({ materialSimilarity }) => {
      scoreIfDirectChildrenArePairs += materialSimilarity.pair.score;
      scoreIfDirectChildrenAreListOfPairs += materialSimilarity.listOfPairs.score;
    });
    return scoreIfDirectChildrenArePairs > scoreIfDirectChildrenAreListOfPairs
      ? {
        score: scoreIfDirectChildrenArePairs,
        pairs: nodeDataList.map(({ materialSimilarity }) => materialSimilarity.pair)
      }
      : {
        score: scoreIfDirectChildrenAreListOfPairs,
        pairs: nodeDataList.reduce((acc, { materialSimilarity }) =>
          [...acc, ...materialSimilarity.listOfPairs.pairs]
        , [] as { name: string; quantity: string; }[])
      };
  }
  function calcMaterialScoreAndPair(scores: { name: number; quantity: number; textContent: string; count: number; }[]): NodeData['materialSimilarity']['pair'] {
    const length = scores.length;
    if (length === 0 || excludeAsMaterialRegExp.test(scores.map(({ textContent }) => textContent).join(''))) {
      return { score: 0, name: '', quantity: '' };
    }
    let boundaryIndex = -1;
    let score = -1;
    for (let i = 0; i <= length; i++) {
      const { nameSimilarity, nameCount, quantitySimilarity, quantityCount } = scores.reduce(({ nameSimilarity, nameCount, quantitySimilarity, quantityCount }, current, j) => ({
        nameSimilarity: j < i ? nameSimilarity + current.name : nameSimilarity,
        nameCount: j < i ? nameCount + current.count : nameCount,
        quantitySimilarity: j < i ? quantitySimilarity : quantitySimilarity + current.quantity,
        quantityCount: j < i ? quantityCount : quantityCount + current.count,
      }), { nameSimilarity: 0, nameCount: 0, quantitySimilarity: 0, quantityCount: 0 });
      const nameScore = nameCount && (nameSimilarity / nameCount) * relativeDistribution(nameCount, materialStat.name.wordCounts.avg, materialStat.name.wordCounts.sd); // ranges from 0 to 1
      const quantityScore = quantityCount && (quantitySimilarity / quantityCount) * relativeDistribution(quantityCount, materialStat.quantity.wordCounts.avg, materialStat.quantity.wordCounts.sd); // ranges from 0 to 1
      const _totalScore = nameScore + quantityScore - 1; // ranges from -1 to 1
      if (_totalScore >= score) {
        score = _totalScore;
        boundaryIndex = i;
      }
    }
    return scores.reduce(({ score, name, quantity }, { textContent }, j) => ({
      score,
      name: j < boundaryIndex ? name + textContent : name,
      quantity: j < boundaryIndex ? quantity : quantity + textContent
    }), { score, name: '', quantity: '' });
  }

  return visitNode(document.body).then(() => ({
    materials: materials.reduce((acc, { name, quantity }) => {
      acc[name] = quantity;
      return acc;
    }, {} as { [name: string]: string; }),
    procedures
  }));
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
  return relativeDistributionAsCorrect / (relativeDistributionAsCorrect + relativeDistributionAsOthers);
}