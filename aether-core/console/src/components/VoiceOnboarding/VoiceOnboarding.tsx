import React, { useState, useEffect, useRef } from "react";
import { Modal, Steps, Button, Progress, Alert, message } from "antd";
import {
  AudioOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { useTheme } from "../../contexts/ThemeContext";
import voiceService from "../../services/voiceService";
import styles from "./VoiceOnboarding.module.less";

export interface VoiceOnboardingProps {
  open: boolean;
  onClose: () => void;
  onCalibrationComplete?: () => void;
}

export const VoiceOnboarding: React.FC<VoiceOnboardingProps> = ({
  open,
  onClose,
  onCalibrationComplete,
}) => {
  const { isDark } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlobs, setRecordedBlobs] = useState<Blob[]>([]);
  const [volume, setVolume] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up on modal close
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setRecordedBlobs([]);
      setIsRecording(false);
      setErrorText(null);
      stopRecordingSession();
    }
  }, [open]);

  // Handle active volume monitoring when recording
  useEffect(() => {
    if (isRecording) {
      voiceService.registerCallbacks({
        onVolumeChanged: (vol) => {
          setVolume(vol);
        },
      });
      // Start recording timer
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 4) { // auto stop after 4 seconds
            stopRecording();
            return 4;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setVolume(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const stopRecordingSession = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    voiceService.stopListening();
  };

  const startRecording = async () => {
    setErrorText(null);
    audioChunksRef.current = [];
    
    try {
      const ok = await voiceService.startListening();
      if (!ok) {
        setErrorText("Não foi possível acessar seu microfone. Verifique as permissões do navegador.");
        return;
      }

      // @ts-ignore - access raw stream track for MediaRecorder
      const stream = voiceService["mediaStream"];
      if (!stream) {
        setErrorText("Erro ao inicializar o gravador de áudio.");
        return;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        setRecordedBlobs((prev) => {
          const next = [...prev, audioBlob];
          console.log(`[VoiceOnboarding] Sample ${next.length} recorded.`);
          return next;
        });
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Start recording failed:", err);
      setErrorText("Erro de microfone: " + (err.message || err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    voiceService.stopListening();
  };

  const handleNextStep = async () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => prev + 1);
    } else if (currentStep === 3) {
      // Step 3 is completed. Process calibration.
      setIsProcessing(true);
      setErrorText(null);

      // Wait a moment for UX
      setTimeout(async () => {
        try {
          const result = await voiceService.calibrateFootprint(recordedBlobs);
          setIsProcessing(false);
          
          if (result.success) {
            message.success("Calibração de voz concluída com sucesso!");
            setCurrentStep(4); // Success step
            if (onCalibrationComplete) {
              onCalibrationComplete();
            }
          } else {
            setErrorText(result.error || "Ocorreu um erro ao calcular o footprint de voz.");
            // Reset samples to try again
            setRecordedBlobs([]);
            setCurrentStep(1);
          }
        } catch (e: any) {
          setIsProcessing(false);
          setErrorText(e.message || "Erro durante o processamento da biometria.");
          setRecordedBlobs([]);
          setCurrentStep(1);
        }
      }, 1500);
    }
  };

  const resetCalibration = () => {
    setRecordedBlobs([]);
    setCurrentStep(1);
    setErrorText(null);
  };


  const wakeWordName = localStorage.getItem("aether_wakeword") || "Aether";

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SafetyOutlined style={{ color: "#1677ff", fontSize: 20 }} />
          <span>Configuração de Biometria de Voz</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      className={`${styles.onboardingModal} ${isDark ? styles.dark : ""}`}
      styles={{
        content: isDark
          ? {
              background: "#1f1f1f",
              color: "rgba(255,255,255,0.85)",
            }
          : undefined,
        header: isDark
          ? {
              background: "#1f1f1f",
              color: "rgba(255,255,255,0.85)",
            }
          : undefined,
      }}
    >
      <Steps
        current={currentStep}
        size="small"
        className={styles.steps}
        items={[
          { title: "Permissão" },
          { title: "Amostra 1" },
          { title: "Amostra 2" },
          { title: "Amostra 3" },
          { title: "Pronto" },
        ]}
      />

      <div className={styles.contentBody}>
        {errorText && (
          <Alert
            message="Erro de Biometria"
            description={errorText}
            type="error"
            showIcon
            closable
            onClose={() => setErrorText(null)}
            className={styles.alert}
          />
        )}

        {currentStep === 0 && (
          <div className={styles.stepContainer}>
            <AudioOutlined className={styles.mainIcon} style={{ color: "#1677ff" }} />
            <h3>Ativar Segurança Biométrica</h3>
            <p>
              O Aether usa biometria de voz local para garantir que apenas você possa acionar o console por comandos de voz. 
              Grave 3 amostras curtas para criar seu footprint digital de voz.
            </p>
            <Button
              type="primary"
              size="large"
              icon={<SafetyOutlined />}
              onClick={() => setCurrentStep(1)}
              className={styles.actionBtn}
            >
              Iniciar Calibração
            </Button>
          </div>
        )}

        {(currentStep === 1 || currentStep === 2 || currentStep === 3) && (
          <div className={styles.stepContainer}>
            <div className={styles.sampleHeader}>
              <span>Amostra de Voz {currentStep} de 3</span>
            </div>
            
            <div className={`${styles.recordCircle} ${isRecording ? styles.recording : ""}`}>
              {isRecording ? (
                <div className={styles.volumeWave} style={{ transform: `scale(${1 + volume / 100})` }} />
              ) : null}
              <Button
                type="primary"
                shape="circle"
                danger={isRecording}
                icon={isRecording ? <AudioOutlined /> : <AudioOutlined />}
                className={styles.recordBtn}
                onClick={isRecording ? stopRecording : startRecording}
              />
            </div>

            <div className={styles.recordInstruction}>
              {isRecording ? (
                <div>
                  <p className={styles.recordingText}>Gravando... Fale claramente:</p>
                  <h2 className={styles.phraseToSay}>"{wakeWordName}"</h2>
                  <div className={styles.timer}>Auto-parada em {4 - recordingSeconds}s</div>
                </div>
              ) : (
                <div>
                  <p>Clique no botão e diga claramente a palavra de ativação:</p>
                  <h2 className={styles.phraseToSay}>"{wakeWordName}"</h2>
                </div>
              )}
            </div>

            <div className={styles.progressContainer}>
              <Progress
                percent={isRecording ? (recordingSeconds / 4) * 100 : recordedBlobs[currentStep - 1] ? 100 : 0}
                showInfo={false}
                strokeColor="#1677ff"
              />
            </div>

            <div className={styles.stepActions}>
              <Button
                type="primary"
                size="large"
                disabled={isRecording || !recordedBlobs[currentStep - 1]}
                onClick={handleNextStep}
                loading={isProcessing}
                className={styles.actionBtn}
              >
                {currentStep === 3 ? "Processar Calibração" : "Confirmar Amostra"}
              </Button>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className={styles.processingOverlay}>
            <LoadingOutlined className={styles.processingSpinner} />
            <h3>Processando Biometria...</h3>
            <p>Calculando vetor médio e extraindo características da sua voz de forma totalmente offline.</p>
          </div>
        )}

        {currentStep === 4 && (
          <div className={styles.stepContainer}>
            <CheckCircleOutlined className={styles.mainIcon} style={{ color: "#52c41a" }} />
            <h3>Configuração Concluída!</h3>
            <p>
              Sua biometria de voz foi salva com sucesso em seu navegador.
              O Aether agora responderá exclusivamente aos seus comandos de voz.
            </p>
            <div className={styles.successMeta}>
              <div>Palavra de ativação: <strong>{wakeWordName}</strong></div>
              <div>Segurança: <strong>Local (Vetor TDNN 256)</strong></div>
            </div>
            <div className={styles.finishActions}>
              <Button
                type="primary"
                size="large"
                onClick={onClose}
                className={styles.actionBtn}
              >
                Concluir
              </Button>
              <Button type="link" onClick={resetCalibration}>
                Refazer Calibração
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default VoiceOnboarding;
