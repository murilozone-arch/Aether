class ConsoleTtsService {
  private enabled: boolean = false;
  private ttsMode: "local" | "remote" = "local";
  private remoteTtsUrl: string = "http://localhost:5002/tts";
  private remoteTtsVoice: string = "";
  private currentAudio: HTMLAudioElement | null = null;

  constructor() {
    const saved = localStorage.getItem("aether_console_tts_enabled");
    this.enabled = saved === null ? true : saved === "true";
    this.ttsMode = (localStorage.getItem("aether_console_tts_mode") || "local") as "local" | "remote";
    this.remoteTtsUrl = localStorage.getItem("aether_console_remote_tts_url") || "http://localhost:5002/tts";
    this.remoteTtsVoice = localStorage.getItem("aether_console_remote_tts_voice") || "";
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem("aether_console_tts_enabled", enabled ? "true" : "false");
    if (!enabled) {
      this.stop();
    }
  }

  public updateModeConfig(cfg: { mode?: "local" | "remote"; url?: string; voice?: string }): void {
    if (cfg.mode) this.ttsMode = cfg.mode;
    if (cfg.url !== undefined) this.remoteTtsUrl = cfg.url;
    if (cfg.voice !== undefined) this.remoteTtsVoice = cfg.voice;
  }

  public speak(text: string): void {
    if (!this.enabled || !text.trim()) return;

    this.stop();

    // Extract speak tag if present
    let speakText = this.extractSpeakText(text);
    if (!speakText) {
      // If no speak tag, only speak the text if it's short (under 200 chars) to avoid reading long code/tables
      if (text.length < 200) {
        speakText = this.cleanMarkdown(text);
      }
    }

    if (!speakText.trim()) return;

    if (this.ttsMode === "remote") {
      console.log("[ConsoleTts] Speaking remote:", speakText);
      try {
        let audioUrl = `${this.remoteTtsUrl}?text=${encodeURIComponent(speakText)}`;
        if (this.remoteTtsVoice) {
          audioUrl += `&voice=${encodeURIComponent(this.remoteTtsVoice)}`;
        }
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;
        audio.play().catch(err => {
          console.error("[ConsoleTts] Remote TTS playback failed:", err);
        });
      } catch (err) {
        console.error("[ConsoleTts] Remote TTS setup failed:", err);
      }
      return;
    }

    console.log("[ConsoleTts] Speaking local:", speakText);

    try {
      const utterance = new SpeechSynthesisUtterance(speakText);
      
      // Select a nice Portuguese voice if language is Portuguese
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith("pt") || v.lang.startsWith("pt-BR"));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("[ConsoleTts] SpeechSynthesis failed:", err);
    }
  }

  public stop(): void {
    try {
      window.speechSynthesis.cancel();
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
    } catch (err) {
      console.error("[ConsoleTts] Cancel failed:", err);
    }
  }

  private extractSpeakText(message: string): string {
    const match = message.match(/<speak>([\s\S]*?)<\/speak>/i);
    return match ? match[1].trim() : "";
  }

  private cleanMarkdown(text: string): string {
    // Strip HTML/speak tags
    let clean = text.replace(/<[^>]*>/g, "");
    // Strip markdown formatting simple characters (asterisks, links)
    clean = clean.replace(/[*_`#]/g, "");
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    return clean.trim();
  }
}

export const consoleTtsService = new ConsoleTtsService();
export default consoleTtsService;
