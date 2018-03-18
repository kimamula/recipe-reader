import path from 'path';
import { allSiteData, getMaterialsNameAndQuantity, SiteData } from '../lib/site-data';
import fs, { WriteStream } from 'fs';
import { JSDOM } from 'jsdom';
import glob from 'glob';
import { createKuromojiTokenizer } from '../lib/kuromoji';
import { loadWord2vecModel } from '../lib/word2vec';
import { createProcedureInputVectorOfElement, createMaterialInputVectorOfElement, LeaningData } from '../lib/infer';
import { truthyFilter } from '../lib/util';

Promise.all([createKuromojiTokenizer(), loadWord2vecModel()]).then(([tokenizer, model]) => {
  async function createLearningDataForFile(siteData: SiteData, file: string): Promise<{ [key: 'material' | 'procedure']: LeaningData; }> {
    return new Promise<LeaningData>((resolve, reject) => fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      const document = new JSDOM(data).window.document;
      resolve({
        material: createMaterialLearningDataForFile(document),
        procedure: createProcedureLearningDataForFile(document)
      })
    }));
  }
  function createProcedureLearningDataForFile(document: Document): LeaningData {
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
      return { input: [], output: [] };
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
    return {
      input: [...proceduresInputVector, ...nonProceduresInputVector],
      output: [...proceduresInputVector.map(() => 1), ...nonProceduresInputVector.map(() => 0)]
    };
  }
  function createMaterialLearningDataForFile(document: Document): LeaningData {
    const materials = Array.from(document.querySelectorAll(siteData.materials))
      .filter(material => {
        const { name, quantity } = getMaterialsNameAndQuantity(material, siteData);
        return !!name && !!quantity;
      });

    const materialsInputVector = materials
      .map(material => createMaterialInputVectorOfElement(tokenizer, model, material))
      .filter(truthyFilter);
    const materialsInputVectorLength = materialsInputVector.length;
    if (materialsInputVectorLength === 0) {
      return { input: [], output: [] };
    }
    const nonMaterials = Array.from(document.querySelectorAll('dl, li, div, p, span'))
      .filter((element: Element | null) => {
        // Remove elements under materials
        while (element) {
          if (element.matches(siteData.materials)) {
            return false;
          }
          element = element.parentElement;
        }
        return true;
      });
    const nonMaterialsInputVector: number[][] = [];
    let nonMaterialsInputVectorLength = 0;
    while (nonMaterialsInputVectorLength < materialsInputVectorLength) {
      const length = nonMaterials.length;
      if (length === 0) {
        break;
      }
      const index = Math.floor(Math.random() * length);
      const nonMaterial = nonMaterials.splice(index, 1)[0];
      const nonMaterialInputVector = createMaterialInputVectorOfElement(tokenizer, model, nonMaterial);
      if (nonMaterialInputVector) {
        nonMaterialsInputVector.push(nonMaterialInputVector);
        nonMaterialsInputVectorLength += 1;
      }
    }
    return {
      input: [...materialsInputVector, ...nonMaterialsInputVector],
      output: [...materialsInputVector.map(() => 1), ...nonMaterialsInputVector.map(() => 0)]
    };
  }
  function createLearningDataWriteStream(fileName: string): WriteStream {
    const writeStream = fs.createWriteStream(path.resolve(__dirname, '../data/', fileName), 'utf8');
    writeStream.write('[');
    return writeStream;
  }
  const writeStreams = {
    material: {
      first: false,
      inputStream: createLearningDataWriteStream('material-learning-data-input.json'),
      outputStream: createLearningDataWriteStream('material-learning-data-output.json'),
    },
    procedure: {
      first: false,
      inputStream: createLearningDataWriteStream('procedure-learning-data-input.json'),
      outputStream: createLearningDataWriteStream('procedure-learning-data-output.json'),
    }
  };
  function writeToStream(learningData: { [key: 'material' | 'procedure']: LeaningData; }, type: 'material' | 'procedure', file: string): void {
    const { input, output } = learningData[type];
    if (input.length === 0) {
      console.log(`could not find ${type} in ${file}`);
      return;
    }
    const { first, inputStream, outputStream } = writeStreams[type];
    if (first) {
      writeStreams[type].first = false;
    } else {
      inputStream.write(',');
      outputStream.write(',');
    }
    inputStream.write(input.map(vec => JSON.stringify(vec)).join());
    outputStream.write(output.join());
  }
  return Promise
    .all(Object.keys(allSiteData).map(siteName => new Promise((resolve, reject) =>
      glob(`${path.resolve(__dirname, '../../recipes', siteName)}/*.html`, async (err, files) => {
        if (err) {
          return reject(err);
        }
        let count = 0;
        for (const file of files) {
          const data = await createLearningDataForFile(allSiteData[siteName], file);
          writeToStream(data, 'material', file);
          writeToStream(data, 'procedure', file);
          count += 1;
          count % 100 === 0 && console.log(`Finished processing ${count}th file of ${siteName}`);
        }
        resolve();
      })
    )))
    .then(() => {
      writeStreams.material.inputStream.end(']');
      writeStreams.material.outputStream.end(']');
      writeStreams.procedure.inputStream.end(']');
      writeStreams.procedure.outputStream.end(']');
    })
    .catch(err => console.error(err));
});