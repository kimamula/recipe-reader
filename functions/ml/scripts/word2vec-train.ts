import word2vec from 'word2vec';
import path from 'path';

word2vec.word2vec(
  path.resolve(__dirname, '../../recipes/kuromojied.txt'),
  path.resolve(__dirname, '../data/word2vec.model.txt'),
  {
    iter: 30,
    minCount: 4,
  },
);