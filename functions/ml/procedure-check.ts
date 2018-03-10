import KerasJS from 'keras-js';
import { JSDOM } from 'jsdom';
import { createKuromojiTokenizer, createProcedureInputVectorOfElement, loadWord2vecModel } from './common';
import path from 'path';

const element = new JSDOM(process.argv[2]).window.document.firstElementChild!;
const kerasModel = new KerasJS.Model({ filepath: path.resolve(__dirname, 'data', 'procedure-model.bin'), filesystem: true });

Promise
  .all([createKuromojiTokenizer(), loadWord2vecModel(), kerasModel.ready()])
  .then(([tokenizer, word2VecModel]) => {
    const vector = createProcedureInputVectorOfElement(tokenizer, word2VecModel, element);
    return vector
      ? kerasModel
        .predict({ input: new Float32Array(vector) })
        .then(({ output }) => console.log((output[0] - 0.5) * 2))
      : Promise.reject(new Error('could not create vector'));
  });
