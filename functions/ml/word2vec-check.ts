import { loadWord2vecModel } from './common';

const word = process.argv[2];

loadWord2vecModel().then(model => {
  console.log('vector', model.getVector(word));
  console.log('mostSimilar', model.mostSimilar(word, 20));
});

