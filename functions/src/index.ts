import * as functions from 'firebase-functions';
import { DialogflowApp as App } from 'actions-on-google';
import { createKuromojiTokenizer, infer, KerasModelWrapper, loadWord2vecModel } from '../ml/common';

process.env.DEBUG = 'actions-on-google:*';

const FETCH_ACTION = 'fetch';
const URL_ARGUMENT = 'url';
const PATH_ARGUMENT = 'path';

const INFER_ACTION = 'infer';
const YES_NO_ARGUMENT = 'yes-no';

const MATERIAL_ACTION = 'material';
const MATERIAL_NAME_ARGUMENT = 'name';

const PROCEDURE_ACTION = 'procedure';
const NEXT_PROCEDURE_ACTION = 'procedure.next';
const PREVIOUS_PROCEDURE_ACTION = 'procedure.previous';
const CURRENT_PROCEDURE_ACTION = 'procedure.current';
const PROCEDURE_NUMBER_ARGUMENT = 'number';

const RECIPE_CONTEXT_NAME = 'recipe';
const RECIPE_CONTEXT_LIFESPAN = Math.pow(2, 31) - 1; // Maximum signed Integer
const CONTEXT_ARGUMENT_HTML = 'html';
const CONTEXT_ARGUMENT_MATERIALS = 'materials';
const CONTEXT_ARGUMENT_PROCEDURES = 'procedures';
const CONTEXT_ARGUMENT_CURRENT_PROCEDURE = 'currentProcedure';

const REQUEST_RECIPE_URL_MESSAGE = 'はじめにレシピのURLを入力してください。';
const CANCEL_MESSAGE = 'キャンセルしました。再度レシピのURLを入力してください。';

exports.recipeReader = functions.https.onRequest((request, response) => {
  const app = new App({request, response});

  const actionMap = new Map();
  actionMap.set(FETCH_ACTION, executeFetch);
  actionMap.set(INFER_ACTION, executeInfer);
  actionMap.set(MATERIAL_ACTION, material);
  actionMap.set(PROCEDURE_ACTION, procedure);
  actionMap.set(CURRENT_PROCEDURE_ACTION, (app: App) => relativeProcedure(app));
  actionMap.set(PREVIOUS_PROCEDURE_ACTION, (app: App) => relativeProcedure(app, -1));
  actionMap.set(NEXT_PROCEDURE_ACTION, (app: App) => relativeProcedure(app, 1));

  app.handleRequest(actionMap);
});

/**
 * Extract a name which is highly likely an actual material name from an argument which may contain noise
 */
function highlyLikelyMaterialName(materials: { [key: string]: string; }): string | undefined {
  const names = Object.keys(materials);
  for (const name of names) {
    // entry whose name and quantity both exceed 2 characters is highly likely an actual material
    if (name.length > 1 && materials[name] && materials[name].length > 1) {
      return name;
    }
  }
  return names[0];
}

const urlRegex = /^https?:\/\//;
export function executeFetch(app: App): any {
  const url = app.getArgument(URL_ARGUMENT) as any;
  if (!urlRegex.test(url)) {
    return app.ask('URL は HTTP または HTTPS から入力してください。');
  }
  const path = app.getArgument(PATH_ARGUMENT) as any;
  _fetch(app, `${url}/${path || ''}`);
}
function _fetch(app: App, url: string): any {
  const fetchFunc: typeof fetch = require('node-fetch');
  fetchFunc(url, { redirect: 'follow' })
    .then(res => res.ok ? res.text() : res.text().then(text => console.error(res.statusText, text)) && Promise.reject(res))
    .then(html => {
      const { JSDOM } = require('jsdom');
      const document: Document = new JSDOM(html).window.document;
      document.querySelectorAll('style, script, noscript, img').forEach(s => s.remove());
      app.setContext(RECIPE_CONTEXT_NAME, 1, { [CONTEXT_ARGUMENT_HTML]: document.body.outerHTML });
      app.ask(`「${document.title}」からレシピ情報を読み込みます。よろしいですか？`);
    })
    .catch(err => {
      console.error(err);
      app.ask('申し訳ございません、ご指定の URL へのアクセスに失敗しました。 URL が正しいかご確認ください。');
    });
}

export function executeInfer(app: App): any {
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext || !recipeContext.parameters[CONTEXT_ARGUMENT_HTML]) {
    app.ask(REQUEST_RECIPE_URL_MESSAGE);
    return;
  }
  const yesNo = app.getArgument(YES_NO_ARGUMENT) as any;
  if (yesNo !== 'yes') {
    app.ask(CANCEL_MESSAGE);
    return;
  }
  const html = recipeContext.parameters[CONTEXT_ARGUMENT_HTML] as string;
  const materialStat = require('../ml/data/material-stat.json') as { [key in 'name' | 'quantity']: { [label in 'correct' | 'others']: { avg: number; sd: number; }; }; };
  const materialVector = require('../ml/data/material-vector.json') as { [key in 'name' | 'quantity']: number[]; };
  Promise
    .all([
      createKuromojiTokenizer(),
      loadWord2vecModel(),
      new Promise<KerasModelWrapper>(resolve => {
        const KerasJS = require('keras-js');
        const kerasModelWrapper = new KerasModelWrapper(new KerasJS.Model({ filepath: './ml/data/procedure-model.bin', filesystem: true }));
        kerasModelWrapper.ready().then(() => resolve(kerasModelWrapper));
      }),
      new Promise<Document>(resolve => {
        const { JSDOM } = require('jsdom');
        const document: Document = new JSDOM(html).window.document;
        resolve(document);
      }),
    ])
    .then(([tokenizer, word2VecModel, kerasModelWrapper, document]) =>
      infer(tokenizer, word2VecModel, kerasModelWrapper, document, materialVector, materialStat)
        .then(({ materials, procedures }) => {
          app.setContext(RECIPE_CONTEXT_NAME, RECIPE_CONTEXT_LIFESPAN, {
            [CONTEXT_ARGUMENT_MATERIALS]: materials,
            [CONTEXT_ARGUMENT_PROCEDURES]: procedures,
            [CONTEXT_ARGUMENT_CURRENT_PROCEDURE]: null,
          });
          app.ask(`レシピ情報を抽出しました。
    「材料」、「${highlyLikelyMaterialName(materials) || ''}」、「手順」、「作り方」、「1」、「次」、「前」など、読み上げる情報を指定してください。`);
        })
    )
    .catch(err => {
      console.error(err);
      app.ask('申し訳ございません、レシピ情報が抽出できませんでした。');
    });
}

export function getMaterialQuantity(materials: { [key: string]: string; }, name: string, matchScorer: (s1: string, s2: string) => number): Promise<string | undefined> {
  if (materials[name]) {
    return Promise.resolve(materials[name]);
  }
  return createKuromojiTokenizer().then(({ tokenizer }) => {
    const argumentReading = tokenizer.tokenize(name).map(({ reading, surface_form }) => reading || surface_form).join('');
    const materialNames = Object.keys(materials);
    let bestMatchQuantity: string | undefined;
    let bestMatchScore = 0;
    for (const materialName of materialNames) {
      const materialNameReading = tokenizer.tokenize(materialName).map(({ reading, surface_form }) => reading || surface_form).join('');
      const matchScore = matchScorer(argumentReading, materialNameReading);
      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        bestMatchQuantity = materials[materialName];
      }
    }
    return bestMatchQuantity;
  });
}

export function longestCommonSubstringRatio(s1: string, s2: string): number {
  const s1Length = s1.length;
  const s2Length = s2.length;
  if (s1Length === 0 || s2Length === 0) {
    return 0;
  }
  let longest = 0;
  const table: number[][] = [];
  for (let i = 0; i < s1Length; i++) {
    table[i] = [];
    for (let j = 0; j < s2Length; j++) {
      if (s1[i] !== s2[j]) {
        table[i][j] = 0;
        continue;
      }
      table[i][j] = (table[i - 1] && table[i - 1][j - 1] || 0) + 1;
      if (table[i][j] > longest) {
        longest = table[i][j];
      }
    }
  }
  return (longest * longest) / (s1Length * s2Length);
}

export function material(app: App): void {
  const materialName = app.getArgument(MATERIAL_NAME_ARGUMENT) as any;
  if (urlRegex.test(materialName)) {
    // as the input for the material input is set to @sys.any, sometimes URL is wrongly navigated.
    return _fetch(app, materialName);
  }
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext || !recipeContext.parameters[CONTEXT_ARGUMENT_MATERIALS]) {
    app.ask(REQUEST_RECIPE_URL_MESSAGE);
    return;
  }
  const materials = recipeContext.parameters[CONTEXT_ARGUMENT_MATERIALS] as { [key: string]: string; };
  if (materialName) {
    getMaterialQuantity(materials, materialName, longestCommonSubstringRatio)
      .then(quantity => {
        if (typeof quantity === 'undefined') {
          app.ask(`申し訳ございません、${materialName}を材料から見つけることができませんでした。`);
        } else {
          app.setContext(RECIPE_CONTEXT_NAME, RECIPE_CONTEXT_LIFESPAN, {
            [CONTEXT_ARGUMENT_MATERIALS]: { ...materials, materialName: quantity }
          });
          app.ask(quantity);
        }
      });
  } else {
    app.ask(Object.keys(materials).map(key => `${key}: ${materials[key]}`).join('\n'));
  }
}

export function procedure(app: App): void {
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext || !recipeContext.parameters[CONTEXT_ARGUMENT_PROCEDURES]) {
    app.ask(REQUEST_RECIPE_URL_MESSAGE);
    return;
  }
  const procedures = recipeContext.parameters[CONTEXT_ARGUMENT_PROCEDURES] as string[];
  const procedureNumber = app.getArgument(PROCEDURE_NUMBER_ARGUMENT) as any;
  if (procedures[Number(procedureNumber) - 1]) {
    app.setContext(RECIPE_CONTEXT_NAME, RECIPE_CONTEXT_LIFESPAN, {
      [CONTEXT_ARGUMENT_CURRENT_PROCEDURE]: Number(procedureNumber)
    });
    app.ask(procedures[Number(procedureNumber) - 1]);
  }
  app.ask(procedureNumber
    ? `手順は1から${procedures.length}までの数字を指定してください。`
    // TODO: Consider prefixing procedures with numbers
    // Note that there are 3 types of sites;
    // 1. All procedures are prefixed with numbers.
    // 2. No procedures are prefixed with numbers.
    // 3. Some procedures are prefixed with numbers, while others are not.
    // To make things worse, some sites display numbers with images, in which case auto numbering may result in mismatching with the displayed numbers.
    // And of course, sometimes a procedure begins with a number which does not indicate the order of the procedure,
    // such as "100 cc の牛乳を加えてよく混ぜる。".
    : procedures.join('\n')
  );
}

export function relativeProcedure(app: App, diff?: number): void {
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext || !recipeContext.parameters[CONTEXT_ARGUMENT_PROCEDURES]) {
    app.ask(REQUEST_RECIPE_URL_MESSAGE);
    return;
  }
  const procedures = recipeContext.parameters[CONTEXT_ARGUMENT_PROCEDURES] as string[];
  let currentProcedure = recipeContext.parameters[CONTEXT_ARGUMENT_CURRENT_PROCEDURE] as number;
  if (typeof currentProcedure !== 'number') {
    currentProcedure = 1;
  } else if (diff) {
    if (diff > 0 && currentProcedure >= procedures.length) {
      app.ask(`現在の手順${currentProcedure}が最後の手順です。`);
      return;
    }
    if (diff < 0 && currentProcedure <= 1) {
      app.ask('現在手順1です。これより前の手順はありません。');
      return;
    }
    currentProcedure += diff;
  }
  app.setContext(RECIPE_CONTEXT_NAME, RECIPE_CONTEXT_LIFESPAN, {
    [CONTEXT_ARGUMENT_CURRENT_PROCEDURE]: currentProcedure
  });
  app.ask(procedures[currentProcedure - 1]);
}