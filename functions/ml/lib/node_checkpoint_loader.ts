import { Tensor } from 'deeplearn';
import * as path from 'path';
import * as fs from 'fs';

export interface CheckpointVariable {
  filename: string;
  shape: number[];
}

export type CheckpointManifest = {
  [varName: string]: CheckpointVariable
};

export interface Variables {
  [varName: string]: Tensor;
}

export class NodeCheckpointLoader {
  private checkpointManifest: CheckpointManifest;
  private variables: Variables;

  /**
   * NodeCheckpointLoader constructor
   * @param {string} checkpointFilePath should be either an absolute path or a relative path to the current working directory
   */
  constructor(private checkpointFilePath: string) {
    this.checkpointManifest = require(path.resolve(this.checkpointFilePath));
  }

  getAllVariables(): Promise<Variables> {
    if (this.variables) {
      return Promise.resolve(this.variables);
    }
    return Promise
      .all<Variables>(Object.keys(this.checkpointManifest).map(varName =>
        this.getVariable(varName)
          .then(tensor => ({[varName]: tensor}))
      ))
      .then(variables => {
        this.variables = Object.assign.apply(null, variables);
        return this.variables;
      });
  }

  getVariable(varName: string): Promise<Tensor> {
    if (!(varName in this.checkpointManifest)) {
      return Promise.reject(new Error(`Cannot load non-existant variable ${varName}`));
    }
    const fileName = this.checkpointManifest[varName].filename;
    const filePath = path.resolve(path.dirname(this.checkpointFilePath), fileName);
    return new Promise<Tensor>((resolve, reject) => fs.readFile(filePath, (err, buffer) => {
      if (err) {
        return reject(err);
      }
      const values = new Float32Array(buffer.buffer);
      resolve(Tensor.make(this.checkpointManifest[varName].shape, {values}));
    }));
  }
}