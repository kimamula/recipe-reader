# recipe-reader

Learn Japanese recipe sites' vocabulary and HTML structure, extract information from them, and read them.
The app is deployed as Google Cloud Functions and can be used as fulfillment for [Dialogflow](https://dialogflow.com/).

## How to start learning recipe sites

1. Install dependencies.

```sh
$ npm install
$ pip install -r requirements.txt
```

2. Write recipe sites's information to `recipes/site-data.json`
    - See [`site-data.ts`](ml/lib/site-data.ts) to understand the required format
3. Now, you can run scripts under ml dir to learn the sites.

## Scripts

The scripts should be used in the following order. The names of the scripts are written with original extensions (`*.ts`), though of course they should be executed like `$ node foo.js`.

The results of the script is stored under [`recipes`](recipes) (data which contain original sites' data and therefore should not be uploaded to GitHub) or [`ml/data`](ml/data) (data which do not contain original sites' data) dir.

### `ml/scripts/collect.ts`

Collects HTML from recipe sites.

### `ml/scripts/preprocess.ts`

Preprocesses the collected HTML for efficient learning.

### `ml/scripts/kuromoji.ts`

Executes morphological analysis on the preprocessed HTML.

### `ml/scripts/word2vec-train.ts`

Executes Word2Vec on the morphologically analyzed document.

### `ml/scripts/calc-material-vector.ts`

Calculates average vector of words used as materials.

### `ml/scripts/calc-material-stat.ts`

Calculates statistics of words used as materials.

### `ml/scripts/create-learning-data-for-procedures.ts`

Creates learning data for procedures from the recipe sites' HTML.

### `ml/scripts/learn-procedure.py`

Executes deep learning on data created by `ml/scripts/create-learning-data-for-procedures.ts`.
You need script implemented in the following commit to convert the model create by this script to the format deeplearn.js can consume.

https://github.com/kimamula/deeplearnjs/commit/5d1eea652833a63f027400cf9c3c40a2079caabd

## misc

### `src/index.ts`

App's entry point.

### `ml/check-scripts/*.ts`

Checks result of each learning process.