import { SpeakerVerification } from "@jaehyun-ko/speaker-verification";
import * as ort from "onnxruntime-web";

// Configure local WASM paths for ONNX Runtime Web to run offline
if (typeof window !== "undefined") {
  ort.env.wasm.wasmPaths = "/models/wasm/";
}

// Declare standard browser Web Speech API types since TypeScript doesn't define them by default
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export interface VoiceServiceConfig {
  wakeWord?: string;
  similarityThreshold?: number;
}

class VoiceService {
  private verifier: SpeakerVerification | null = null;
  private recognition: any = null;
  private isInitialized = false;
  private isListening = false;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private volumeCallback: ((volume: number) => void) | null = null;
  private transcriptCallback: ((text: string) => void) | null = null;
  private wakeWordCallback: (() => void) | null = null;
  private statusCallback: ((status: string) => void) | null = null;
  private wakeWordEngine: any = null;

  // Configurations
  private wakeWord = "aether";
  private similarityThreshold = 0.75;
  private useFallbackWakeWord = true;

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const storedWord = localStorage.getItem("aether_wakeword");
      const storedThreshold = localStorage.getItem("aether_similarity_threshold");
      if (storedWord) this.wakeWord = storedWord.toLowerCase();
      if (storedThreshold) this.similarityThreshold = parseFloat(storedThreshold);
    } catch (e) {
      console.warn("[VoiceService] Failed to load config from localStorage:", e);
    }
  }

  public updateConfig(config: VoiceServiceConfig) {
    if (config.wakeWord) {
      this.wakeWord = config.wakeWord.toLowerCase();
      localStorage.setItem("aether_wakeword", this.wakeWord);
    }
    if (config.similarityThreshold !== undefined) {
      this.similarityThreshold = config.similarityThreshold;
      localStorage.setItem("aether_similarity_threshold", this.similarityThreshold.toString());
    }
  }

  public async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    this.notifyStatus("Inicializando serviço de voz...");

    try {
      // 1. Initialize Speaker Verification
      this.verifier = new SpeakerVerification();
      try {
        this.notifyStatus("Carregando modelo biométrico...");
        // Fetch the model local file to ensure 100% offline usage and bypass HuggingFace CDN block
        const response = await fetch("/models/NeXt_TDNN_C256_B3_K65_7.onnx");
        if (!response.ok) {
          throw new Error(`Falha ao carregar modelo biométrico local: ${response.statusText}`);
        }
        const modelData = await response.arrayBuffer();
        
        await this.verifier.initialize("standard-256", { modelData });
        console.log("[VoiceService] SpeakerVerification initialized successfully with local model data");
      } catch (err) {
        console.warn("[VoiceService] Failed to initialize SpeakerVerification. Verification will be bypassed.", err);
      }

      // 2. Initialize Web Speech API
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "pt-BR";

        this.recognition.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const fullTranscript = (finalTranscript || interimTranscript).trim().toLowerCase();
          console.log("[VoiceService] STT raw:", fullTranscript);

          // If wake word engine is in fallback mode, check if wake word is mentioned
          if (this.useFallbackWakeWord && fullTranscript.includes(this.wakeWord)) {
            console.log(`[VoiceService] Fallback WakeWord "${this.wakeWord}" detected in text!`);
            this.handleWakeWordTriggered();
          }

          if (finalTranscript && this.transcriptCallback) {
            this.transcriptCallback(finalTranscript);
          }
        };

        this.recognition.onerror = (event: any) => {
          console.error("[VoiceService] Speech Recognition Error:", event.error);
        };
      } else {
        console.warn("[VoiceService] Web Speech API (SpeechRecognition) is not supported in this browser.");
      }

      // 3. Attempt to initialize openwakeword-wasm-browser
      try {
        // We import it dynamically to prevent build failures or startup crashes if module is quirky
        const { default: WakeWordEngine } = await import("openwakeword-wasm-browser");
        this.wakeWordEngine = new WakeWordEngine({
          baseAssetUrl: "/models/openwakeword",
          keywords: [this.wakeWord],
          detectionThreshold: 0.5,
        });

        await this.wakeWordEngine.load();
        this.useFallbackWakeWord = false;
        
        this.wakeWordEngine.on("detect", ({ keyword, score }: any) => {
          console.log(`[VoiceService] WakeWord detected: ${keyword} (${score})`);
          this.handleWakeWordTriggered();
        });

        console.log("[VoiceService] openwakeword-wasm-browser initialized successfully");
      } catch (err) {
        console.warn("[VoiceService] openwakeword-wasm-browser failed to load (missing local models). Falling back to Web Speech API word-spotter.", err);
        this.useFallbackWakeWord = true;
      }

      this.isInitialized = true;
      this.notifyStatus("Pronto");
      return true;
    } catch (e) {
      console.error("[VoiceService] Initialization failed:", e);
      this.notifyStatus("Erro na inicialização");
      return false;
    }
  }

  private handleWakeWordTriggered() {
    if (this.wakeWordCallback) {
      this.wakeWordCallback();
    }
  }

  public registerCallbacks(callbacks: {
    onVolumeChanged?: (volume: number) => void;
    onTranscriptReceived?: (text: string) => void;
    onWakeWordDetected?: () => void;
    onStatusChanged?: (status: string) => void;
  }) {
    if (callbacks.onVolumeChanged) this.volumeCallback = callbacks.onVolumeChanged;
    if (callbacks.onTranscriptReceived) this.transcriptCallback = callbacks.onTranscriptReceived;
    if (callbacks.onWakeWordDetected) this.wakeWordCallback = callbacks.onWakeWordDetected;
    if (callbacks.onStatusChanged) this.statusCallback = callbacks.onStatusChanged;
  }

  private notifyStatus(status: string) {
    if (this.statusCallback) {
      this.statusCallback(status);
    }
  }

  public async startListening(): Promise<boolean> {
    if (this.isListening) return true;
    
    // Ensure initialized
    if (!this.isInitialized) {
      const ok = await this.initialize();
      if (!ok) return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isListening = true;
      this.notifyStatus("Ouvindo...");

      // Set up volume monitoring (Audio Context & Analyser)
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);
        this.monitorVolume();
      } catch (audioErr) {
        console.warn("[VoiceService] Could not set up audio analyzer for volume indicator:", audioErr);
      }

      // Start Google Speech Recognition
      if (this.recognition) {
        this.recognition.start();
      }

      // Start WakeWord Engine if active
      if (this.wakeWordEngine && !this.useFallbackWakeWord) {
        this.wakeWordEngine.start();
      }

      return true;
    } catch (err) {
      console.error("[VoiceService] Failed to start listening:", err);
      this.notifyStatus("Erro ao acessar microfone");
      this.isListening = false;
      return false;
    }
  }

  public stopListening() {
    if (!this.isListening) return;

    this.isListening = false;
    this.notifyStatus("Desativado");

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    if (this.wakeWordEngine && !this.useFallbackWakeWord) {
      try {
        this.wakeWordEngine.stop();
      } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    if (this.volumeCallback) {
      this.volumeCallback(0);
    }
  }

  private monitorVolume() {
    if (!this.isListening || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVolume = () => {
      if (!this.isListening || !this.analyser) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      
      const average = sum / bufferLength;
      // Normalize to 0-100 range
      const normalizedVolume = Math.min(100, Math.round((average / 255) * 200));
      
      if (this.volumeCallback) {
        this.volumeCallback(normalizedVolume);
      }

      requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }

  /**
   * Extract embedding vector from a recorded voice blob.
   */
  public async getEmbeddingFromBlob(blob: Blob): Promise<Float32Array | null> {
    if (!this.verifier) {
      console.warn("[VoiceService] Speaker verifier is not initialized.");
      return null;
    }
    try {
      const file = new File([blob], "voice.wav", { type: blob.type });
      const result = await this.verifier.getEmbedding(file);
      return result.embedding;
    } catch (err) {
      console.error("[VoiceService] Error extracting embedding:", err);
      return null;
    }
  }

  /**
   * Calibrate the speaker footprint using 3 audio blobs.
   * Calculates the average vector and saves it in LocalStorage.
   */
  public async calibrateFootprint(blobs: Blob[]): Promise<{ success: boolean; footprint?: Float32Array; error?: string }> {
    if (!this.verifier) {
      return { success: false, error: "Serviço de biometria não inicializado." };
    }
    if (blobs.length < 3) {
      return { success: false, error: "São necessárias 3 amostras de voz para calibração." };
    }

    try {
      const embeddings: Float32Array[] = [];
      for (const blob of blobs) {
        const emb = await this.getEmbeddingFromBlob(blob);
        if (emb) {
          embeddings.push(emb);
        }
      }

      if (embeddings.length < 3) {
        return { success: false, error: "Não foi possível extrair a biometria das amostras de voz. Fale de forma mais clara." };
      }

      // Calculate mean embedding vector
      const vectorSize = embeddings[0].length;
      const meanEmbedding = new Float32Array(vectorSize);
      for (let i = 0; i < vectorSize; i++) {
        let sum = 0;
        for (const emb of embeddings) {
          sum += emb[i];
        }
        meanEmbedding[i] = sum / embeddings.length;
      }

      // Save to LocalStorage as serialized JSON
      const serialized = JSON.stringify(Array.from(meanEmbedding));
      localStorage.setItem("aether_speaker_footprint", serialized);

      return { success: true, footprint: meanEmbedding };
    } catch (e: any) {
      console.error("[VoiceService] Calibration failed:", e);
      return { success: false, error: e.message || "Erro desconhecido na calibração." };
    }
  }

  /**
   * Verify if a voice blob matches the calibrated footprint saved in LocalStorage.
   */
  public async verifySpeaker(blob: Blob): Promise<{ isVerified: boolean; similarity: number }> {
    if (!this.verifier) {
      console.warn("[VoiceService] Speaker verifier is not initialized. Bypassing verification.");
      return { isVerified: true, similarity: 1.0 };
    }

    try {
      const storedFootprintJson = localStorage.getItem("aether_speaker_footprint");
      if (!storedFootprintJson) {
        console.warn("[VoiceService] No calibrated footprint found in LocalStorage. Bypassing verification.");
        return { isVerified: true, similarity: 1.0 };
      }

      const footprintArray = JSON.parse(storedFootprintJson) as number[];
      const footprint = new Float32Array(footprintArray);

      const currentEmb = await this.getEmbeddingFromBlob(blob);
      if (!currentEmb) {
        return { isVerified: false, similarity: 0.0 };
      }

      // Compare current embedding with footprint
      const similarity = this.verifier.compareEmbeddings(footprint, currentEmb);
      console.log(`[VoiceService] Speaker similarity: ${similarity} (Threshold: ${this.similarityThreshold})`);

      return {
        isVerified: similarity >= this.similarityThreshold,
        similarity,
      };
    } catch (err) {
      console.error("[VoiceService] Speaker verification failed:", err);
      // Fallback: bypass on error to avoid locking out the user
      return { isVerified: true, similarity: 1.0 };
    }
  }
}

export const voiceService = new VoiceService();
export default voiceService;
