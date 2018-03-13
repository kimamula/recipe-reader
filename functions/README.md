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
    - See [`site-data.ts`](ml/site-data.ts) to understand the required format
3. Now, you can run scripts under ml dir to learn the sites.

## Scripts

The scripts should be used in the following order. The names of the scripts are written with original extensions (`*.ts`), though of course they should be executed like `$ node foo.js`.

The results of the script is stored under [`recipes`](recipes) (data which contain original sites' data and therefore should not be uploaded to GitHub) or [`ml/data`](ml/data) (data which do not contain original sites' data) dir.

### `ml/collect.ts`

Collects HTML from recipe sites.

### `ml/preprocess.ts`

Preprocesses the collected HTML for efficient learning.

### `ml/kuromoji.ts`

Executes morphological analysis on the preprocessed HTML.

### `ml/word2vec-train.ts`

Executes Word2Vec on the morphologically analyzed document.

### `ml/calc-material-vector.ts`

Calculates average vector of words used as materials.

### `ml/calc-material-stat.ts`

Calculates statistics of words used as materials.

### `ml/create-learning-data-for-procedures.ts`

Creates learning data for procedures from the recipe sites' HTML.

### `ml/learn-procedure.py`

Executes deep learning on data created by `ml/create-learning-data-for-procedures.ts`.

### `node_modules/keras-js/python/encoder.py`

Converts saved leaning data of `ml/learn-procuder.py` so that it can be handled with JS.

## misc

### `src/index.ts`

App's entry point.

### `ml/*-check.ts`

Checks result of each learning process.