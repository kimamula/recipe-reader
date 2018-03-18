import { loadWord2vecModel } from '../lib/word2vec';

const word = process.argv[2];

loadWord2vecModel().then(model => {
  console.log('vector', model.getVector(word));
  console.log('mostSimilar', model.mostSimilar(word, 20));
});

