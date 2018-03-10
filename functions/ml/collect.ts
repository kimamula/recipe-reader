import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { allSiteData } from './site-data';

/**
 * Collect recipes from sites specified in site-data.json.
 */

const recipesDir = path.resolve(__dirname, '..', 'recipes');
const maximumRecipeCountPerSite = 10000;

fs.mkdir(recipesDir, () => {
  Object.keys(allSiteData).forEach(siteName => {
    const recipesDirForSite = path.resolve(recipesDir, siteName);
    fs.mkdir(recipesDirForSite, async () => {
      const { urlPrefix, urlSuffix, from, to, fixDigit } = allSiteData[siteName];
      let id = from, count = 0;
      while (id <= to && count <= maximumRecipeCountPerSite) {
        await fetch(`${urlPrefix}${pad0(id, fixDigit)}${urlSuffix}`, { redirect: 'manual' })
          .then(res => res.ok ? res.text() : Promise.reject(res))
          .then(html => new Promise ((resolve, reject) =>
            fs.writeFile(path.resolve(recipesDirForSite, `${id}.html`), html, 'utf8', err => err ? reject(err) : resolve()))
          )
          .then(
            () => {
              id += 1;
              count += 1;
              count % 100 === 0 && console.log(`Fetched ${count} recipes from ${siteName}`);
            },
            err => {
              id += 1;
              if (typeof err.status === 'number') {
                if (err.status < 400 || err.status === 404) {
                  return;
                }
              }
              console.error(err);
            }
          );
      }
      console.log(`Finished fetching recipes from ${siteName}. Total count: ${count}.`);
    });
  });
});

function pad0(id: number, fixDigit = 0): string {
  let idStr = id.toString();
  while (idStr.length < fixDigit) {
    idStr = `0${idStr}`;
  }
  return idStr;
}