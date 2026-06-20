declare module "openwakeword-wasm-browser" {
  export default class WakeWordEngine {
    constructor(config: {
      baseAssetUrl: string;
      keywords: string[];
      detectionThreshold?: number;
      cooldownMs?: number;
    });
    load(): Promise<void>;
    start(): void;
    stop(): void;
    on(event: string, callback: (data: any) => void): void;
  }
}

declare module "@jaehyun-ko/speaker-verification" {
  export class SpeakerVerification {
    initialize(modelName?: string): Promise<void>;
    getEmbedding(audio: File | Blob): Promise<{ embedding: Float32Array }>;
    compareEmbeddings(emb1: Float32Array, emb2: Float32Array): number;
  }
}
