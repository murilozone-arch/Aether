import { useState, useEffect } from "react";
import { Card, Select, Slider, Button, Space, Alert } from "antd";
import { SafetyOutlined, AudioOutlined } from "@ant-design/icons";
import voiceService from "../../../../services/voiceService";
import VoiceOnboarding from "../../../../components/VoiceOnboarding/VoiceOnboarding";
import styles from "../index.module.less";

export function AetherVoiceSecurityCard() {
  const [wakeWord, setWakeWord] = useState("aether");
  const [threshold, setThreshold] = useState(0.75);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [hasFootprint, setHasFootprint] = useState(false);

  useEffect(() => {
    // Load current values on mount
    const storedWord = localStorage.getItem("aether_wakeword");
    const storedThreshold = localStorage.getItem("aether_similarity_threshold");
    const storedFootprint = localStorage.getItem("aether_speaker_footprint");

    if (storedWord) setWakeWord(storedWord);
    if (storedThreshold) setThreshold(parseFloat(storedThreshold));
    if (storedFootprint) setHasFootprint(true);
  }, []);

  const handleWakeWordChange = (value: string) => {
    setWakeWord(value);
    voiceService.updateConfig({ wakeWord: value });
    // If we changed wake word, we should reset footprint since the phrase to record has changed
    localStorage.removeItem("aether_speaker_footprint");
    setHasFootprint(false);
  };

  const handleThresholdChange = (value: number) => {
    setThreshold(value);
    voiceService.updateConfig({ similarityThreshold: value });
  };

  const handleCalibrationComplete = () => {
    setHasFootprint(true);
  };

  return (
    <Card className={styles.card}>
      <h3 className={styles.cardTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SafetyOutlined style={{ color: "#1677ff" }} />
        Biometria e Segurança de Voz (Aether)
      </h3>
      <p className={styles.cardDescription}>
        Configure a palavra de ativação (*Wake Word*) local e ajuste a sensibilidade de verificação biométrica de orador.
      </p>

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Wake Word Selector */}
        <div>
          <span className={styles.optionLabel} style={{ display: "block", marginBottom: 8 }}>
            Palavra de Ativação (Wake Word)
          </span>
          <Select
            value={wakeWord}
            onChange={handleWakeWordChange}
            style={{ width: 240 }}
            options={[
              { value: "aether", label: "Aether" },
              { value: "assistant", label: "Assistant" },
              { value: "lia", label: "Lia" },
              { value: "alexa", label: "Alexa" },
            ]}
          />
          <span className={styles.optionDescription} style={{ display: "block", marginTop: 4 }}>
            Esta palavra ativará a escuta contínua de comandos de voz no navegador.
          </span>
        </div>

        {/* Biometrics Threshold Slider */}
        <div>
          <span className={styles.optionLabel} style={{ display: "block", marginBottom: 8 }}>
            Limiar de Similaridade Biométrica
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Slider
              min={0.5}
              max={0.95}
              step={0.01}
              value={threshold}
              onChange={handleThresholdChange}
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 600, fontSize: 14, minWidth: 40, textAlign: "right" }}>
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <span className={styles.optionDescription} style={{ display: "block", marginTop: 4 }}>
            Valores maiores exigem que a voz seja mais idêntica à calibrada (reduz falsos positivos). Recomendado: 75%.
          </span>
        </div>

        {/* Calibration Section */}
        <div>
          <span className={styles.optionLabel} style={{ display: "block", marginBottom: 8 }}>
            Calibração de Voz do Proprietário
          </span>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {hasFootprint ? (
              <Alert
                type="success"
                showIcon
                message="Biometria Ativa"
                description="Seu footprint de voz foi cadastrado. O console responderá apenas a você."
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                message="Biometria Não Calibrada"
                description="O console responderá a qualquer pessoa que fale a Wake Word até que a biometria seja calibrada."
              />
            )}
            <Button
              type="primary"
              icon={<AudioOutlined />}
              onClick={() => setOnboardingOpen(true)}
            >
              {hasFootprint ? "Recalibrar Voz" : "Cadastrar Biometria"}
            </Button>
          </Space>
        </div>
      </Space>

      <VoiceOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onCalibrationComplete={handleCalibrationComplete}
      />
    </Card>
  );
}
export default AetherVoiceSecurityCard;
