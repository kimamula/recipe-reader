import path from 'path';
import {
  createKuromojiTokenizer,
  createProcedureInputVectorOfElement,
  loadWord2vecModel,
  ProcedureLeaningData,
  truthyFilter
} from './common';
import { allSiteData, SiteData } from './site-data';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import glob from 'glob';

Promise.all([createKuromojiTokenizer(), loadWord2vecModel()]).then(([tokenizer, model]) => {
  async function createLearningDataForFile(siteData: SiteData, file: string): Promise<ProcedureLeaningData> {
    return new Promise<ProcedureLeaningData>((resolve, reject) => fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      const document = new JSDOM(data).window.document;
      let procedures = Array.from(document.querySelectorAll(siteData.procedures));
      if (siteData.proceduresChildren) {
        // Procedure description (without number prefix) alone should be regarded as a procedure
        procedures = procedures.concat(procedures.map(procedure => procedure.querySelector(siteData.proceduresChildren!.desc)).filter(truthyFilter));
      }
      const proceduresInputVector = procedures
        .map(procedure => createProcedureInputVectorOfElement(tokenizer, model, procedure))
        .filter(truthyFilter);
      const proceduresInputVectorLength = proceduresInputVector.length;
      if (proceduresInputVectorLength === 0) {
        return resolve({ input: [], output: [] });
      }
      let nonProcedures = Array.from(document.querySelectorAll('dl, li, div, p, span'))
        .filter((element: Element | null) => {
          // Remove elements under procedure
          while (element) {
            if (element.matches(siteData.procedures)) {
              return false;
            }
            element = element.parentElement;
          }
          return true;
        });
      if (siteData.proceduresChildren) {
        // Procedure number alone should be regarded as a non procedure
        nonProcedures = nonProcedures.concat(procedures.map(procedure => procedure.querySelector(siteData.proceduresChildren!.num)).filter(truthyFilter));
      }
      const nonProceduresInputVector: number[][] = [];
      let nonProceduresInputVectorLength = 0;
      while (nonProceduresInputVectorLength < proceduresInputVectorLength) {
        const length = nonProcedures.length;
        if (length === 0) {
          break;
        }
        const index = Math.floor(Math.random() * length);
        const nonProcedure = nonProcedures.splice(index, 1)[0];
        const nonProcedureInputVector = createProcedureInputVectorOfElement(tokenizer, model, nonProcedure);
        if (nonProcedureInputVector) {
          nonProceduresInputVector.push(nonProcedureInputVector);
          nonProceduresInputVectorLength += 1;
        }
      }
      resolve({
        input: [...proceduresInputVector, ...nonProceduresInputVector],
        output: [...proceduresInputVector.map(() => 1), ...nonProceduresInputVector.map(() => 0)]
      });
    }));
  }
  const inputWriteStream = fs.createWriteStream(path.resolve(__dirname, 'data', 'procedure-learning-data-input.json'), 'utf8');
  const outputWriteStream = fs.createWriteStream(path.resolve(__dirname, 'data', 'procedure-learning-data-output.json'), 'utf8');
  inputWriteStream.write('[');
  outputWriteStream.write('[');
  let first = true;
  return Promise
    .all(Object.keys(allSiteData).map(siteName => new Promise((resolve, reject) =>
      glob(`${path.resolve(__dirname, '..', 'recipes', siteName)}/*.html`, async (err, files) => {
        if (err) {
          return reject(err);
        }
        let count = 0;
        for (const file of files) {
          const { input, output } = await createLearningDataForFile(allSiteData[siteName], file);
          if (input.length === 0) {
            console.log(`could not find procedures in ${file}`);
            continue;
          }
          if (first) {
            first = false;
          } else {
            inputWriteStream.write(',');
            outputWriteStream.write(',');
          }
          inputWriteStream.write(input.map(vec => JSON.stringify(vec)).join());
          outputWriteStream.write(output.join());
          count += 1;
          count % 100 === 0 && console.log(`Finished processing ${count}th file of ${siteName}`);
        }
        resolve();
      })
    )))
    .then(() => {
      inputWriteStream.end(']');
      outputWriteStream.end(']');
    })
    .catch(err => console.error(err));
});