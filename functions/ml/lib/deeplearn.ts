import { NodeCheckpointLoader } from './node-checkpoint-loader';
import { ENV, Tensor1D, Tensor2D } from 'deeplearn';

export interface DeeplearnModel {
  predict(input: number[]): Promise<number>;
}

export class DeeplearnModel {
  static getInstance(loader: NodeCheckpointLoader): Promise<DeeplearnModel> {
    const math = ENV.math;
    return loader.getAllVariables()
      .then(variables => {
        const W1 = variables['dense_1/kernel:0'] as Tensor2D;
        const b1 = variables['dense_1/bias:0'] as Tensor1D;
        const W2 = variables['dense_2/kernel:0'] as Tensor2D;
        const b2 = variables['dense_2/bias:0'] as Tensor1D;
        return {
          predict(input: number[]): Promise<number> {
            const hidden = math.relu(math.add(math.vectorTimesMatrix(Tensor1D.new(input), W1), b1)) as Tensor1D;
            return math.sigmoid(math.add(math.vectorTimesMatrix(hidden, W2), b2)).getValuesAsync().then(v => v[0]);
          }
        }
      });
  }
}