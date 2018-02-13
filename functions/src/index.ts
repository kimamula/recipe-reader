import * as functions from 'firebase-functions';
import { DialogflowApp as App } from 'actions-on-google';

process.env.DEBUG = 'actions-on-google:*';

const SCRAPE_ACTION = 'scrape';
const URL_ARGUMENT = 'url';

const MATERIAL_ACTION = 'material';
const MATERIAL_NAME_ARGUMENT = 'name';

const PROCEDURE_ACTION = 'procedure';
const NEXT_PROCEDURE_ACTION = 'procedure.next';
const PREVIOUS_PROCEDURE_ACTION = 'procedure.previous';
const CURRENT_PROCEDURE_ACTION = 'procedure.current';
const PROCEDURE_NUMBER_ARGUMENT = 'number';

const RECIPE_CONTEXT_NAME = 'recipe';
const RECIPE_CONTEXT_LIFESPAN = Math.pow(2, 31) - 1;
const CONTEXT_ARGUMENT_MATERIALS = 'materials';
const CONTEXT_ARGUMENT_PROCEDURES = 'procedures';
const CONTEXT_ARGUMENT_CURRENT_PROCEDURE = 'currentProcedure';

const REQUEST_RECIPE_URL_MESSAGE = 'レシピのURLを教えてください。';

exports.recipeReader = functions.https.onRequest((request, response) => {
  const app = new App({request, response});

  const actionMap = new Map();
  actionMap.set(SCRAPE_ACTION, scrape);
  actionMap.set(MATERIAL_ACTION, material);
  actionMap.set(PROCEDURE_ACTION, procedure);
  actionMap.set(CURRENT_PROCEDURE_ACTION, (app: App) => relativeProcedure(app));
  actionMap.set(PREVIOUS_PROCEDURE_ACTION, (app: App) => relativeProcedure(app, -1));
  actionMap.set(NEXT_PROCEDURE_ACTION, (app: App) => relativeProcedure(app, 1));

  app.handleRequest(actionMap);
});

export function scrape(app: App): void {
  const url = app.getArgument(URL_ARGUMENT);
  const { materials, procedures } = {
    materials: {
      '醤油': '大さじ１',
      '酒': '大さじ２',
      'みりん': '大さじ１',
      '大根': '1/2株',
      'ぶり': '３切れ'
    },
    procedures: [
      '大根をきる',
      'ぶりを軽く茹でる',
      '鍋に調味料を入れ、落し蓋をして大根とぶりを煮込む'
    ]
  };
  app.setContext(RECIPE_CONTEXT_NAME, RECIPE_CONTEXT_LIFESPAN, {
    [CONTEXT_ARGUMENT_MATERIALS]: materials,
    [CONTEXT_ARGUMENT_PROCEDURES]: procedures,
    [CONTEXT_ARGUMENT_CURRENT_PROCEDURE]: null,
  });
  app.ask(`レシピ情報を抽出しました。「材料」、「${Object.keys(materials)[0]}」、「手順」、「1」、「次」、「前」など、読み上げる情報を指定してください。`);
}

export function material(app: App): void {
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext) {
    app.ask(REQUEST_RECIPE_URL_MESSAGE);
    return;
  }
  const materials = recipeContext.parameters[CONTEXT_ARGUMENT_MATERIALS] as { [key: string]: string; };
  const materialName = app.getArgument(MATERIAL_NAME_ARGUMENT) as any;
  app.ask(materialName
    ? materials[materialName] || `申し訳ございません、${materialName}を材料から見つけることができませんでした。`
    : Object.keys(materials).map(key => `${key}: ${materials[key]}`).join('\n')
  );
}

export function procedure(app: App): void {
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext) {
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
    : procedures.map((procedure, i) => `${i + 1}: ${procedure}`).join('\n')
  );
}

export function relativeProcedure(app: App, diff?: number): void {
  const recipeContext = app.getContext(RECIPE_CONTEXT_NAME) as any;
  if (!recipeContext) {
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