import { JSDOM } from 'jsdom';
import { NodeCheckpointLoader } from '../lib/node_checkpoint_loader';
import { createKuromojiTokenizer } from '../lib/kuromoji';
import { loadWord2vecModel } from '../lib/word2vec';
import { createProcedureInputVectorOfElement } from '../lib/infer';
import { DeeplearnModel } from '../lib/deeplearn';

const element = new JSDOM(process.argv[2]).window.document.firstElementChild!;

Promise
  .all([createKuromojiTokenizer(), loadWord2vecModel(), DeeplearnModel.getInstance(new NodeCheckpointLoader('./ml/data/procedure-model/manifest.json'))])
  .then(([tokenizer, word2VecModel, deeplearnModel]) => {
    const vector = createProcedureInputVectorOfElement(tokenizer, word2VecModel, element);
    return vector
      ? deeplearnModel
        .predict(vector)
        .then(output => console.log((output - 0.5) * 2))
      : Promise.reject(new Error('could not create vector'));
  });
