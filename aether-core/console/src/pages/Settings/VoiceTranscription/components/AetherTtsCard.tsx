import React, { useState, useEffect } from "react";
import { Card, Radio, Input, Space } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import consoleTtsService from "../../../../services/consoleTtsService";
import styles from "../index.module.less";

export const AetherTtsCard: React.FC = () => {
  const [ttsMode, setTtsMode] = useState<"local" | "remote">("local");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteVoice, setRemoteVoice] = useState("");

  useEffect(() => {
    // Load stored config
    const mode = localStorage.getItem("aether_console_tts_mode") || "local";
    const url = localStorage.getItem("aether_console_remote_tts_url") || "http://localhost:5002/tts";
    const voice = localStorage.getItem("aether_console_remote_tts_voice") || "";

    setTtsMode(mode as "local" | "remote");
    setRemoteUrl(url);
    setRemoteVoice(voice);
  }, []);

  const handleModeChange = (e: any) => {
    const value = e.target.value;
    setTtsMode(value);
    localStorage.setItem("aether_console_tts_mode", value);
    consoleTtsService.updateModeConfig({ mode: value });
  };

  const handleUrlChange = (e: any) => {
    const value = e.target.value;
    setRemoteUrl(value);
    localStorage.setItem("aether_console_remote_tts_url", value);
    consoleTtsService.updateModeConfig({ url: value });
  };

  const handleVoiceChange = (e: any) => {
    const value = e.target.value;
    setRemoteVoice(value);
    localStorage.setItem("aether_console_remote_tts_voice", value);
    consoleTtsService.updateModeConfig({ voice: value });
  };

  return (
    <Card className={styles.card}>
      <h3 className={styles.cardTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SoundOutlined style={{ color: "#1677ff" }} />
        Síntese de Voz (TTS) do Agente
      </h3>
      <p className={styles.cardDescription}>
        Escolha entre a síntese de voz local nativa do navegador ou uma API de voz remota (ex: Jarvis, ElevenLabs, OpenAI).
      </p>

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* TTS Mode Selection */}
        <div>
          <span className={styles.optionLabel} style={{ display: "block", marginBottom: 8 }}>
            Modo do TTS
          </span>
          <Radio.Group value={ttsMode} onChange={handleModeChange}>
            <Radio.Button value="local">Local (Nativo do Navegador)</Radio.Button>
            <Radio.Button value="remote">Remoto (Servidor / API)</Radio.Button>
          </Radio.Group>
        </div>

        {/* Remote URL Configuration */}
        {ttsMode === "remote" && (
          <>
            <div>
              <span className={styles.optionLabel} style={{ display: "block", marginBottom: 8 }}>
                URL da API do TTS Remoto
              </span>
              <Input
                value={remoteUrl}
                onChange={handleUrlChange}
                placeholder="Ex: http://localhost:5002/tts"
                style={{ width: "100%", maxWidth: 500 }}
              />
              <span className={styles.optionDescription} style={{ display: "block", marginTop: 4 }}>
                O texto a ser falado será enviado como parâmetro de query (ex: <code>?text=...</code>).
              </span>
            </div>

            <div>
              <span className={styles.optionLabel} style={{ display: "block", marginBottom: 8 }}>
                Voz da API do TTS Remoto (Opcional)
              </span>
              <Input
                value={remoteVoice}
                onChange={handleVoiceChange}
                placeholder="Ex: pt-BR-Jarvis"
                style={{ width: "100%", maxWidth: 300 }}
              />
              <span className={styles.optionDescription} style={{ display: "block", marginTop: 4 }}>
                Nome da voz a ser enviada no parâmetro de query (ex: <code>&voice=...</code>).
              </span>
            </div>
          </>
        )}
      </Space>
    </Card>
  );
};

export default AetherTtsCard;
