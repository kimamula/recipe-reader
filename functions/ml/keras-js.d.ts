declare namespace KerasJS {
  interface ModelParams {
    filepath: string;
    headers?: any;
    filesystem?: boolean;
    gpu?: boolean;
    transferLayerOutputs?: boolean;
    pauseAfterLayerCalls?: boolean;
    visualizations?: string[];
  }
  class Model {
    constructor(params: ModelParams);
    ready(): Promise<void>;
    predict(input: { [inputLayer: string]: any; }): Promise<{ [outputLayer: string]: any }>;
  }
}

declare module 'keras-js' {
  export = KerasJS;
}