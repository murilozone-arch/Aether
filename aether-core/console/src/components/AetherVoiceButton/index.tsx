import React, { useState, useEffect } from "react";
import { Tooltip } from "antd";
import { AudioOutlined } from "@ant-design/icons";
import { IconButton } from "@agentscope-ai/design";
import voiceService from "../../services/voiceService";

export interface AetherVoiceButtonProps {
  disabled?: boolean;
}

export const AetherVoiceButton: React.FC<AetherVoiceButtonProps> = ({ disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState("Desativado");

  useEffect(() => {
    // Initialize voiceService on mount and register callbacks
    voiceService.registerCallbacks({
      onVolumeChanged: (vol) => {
        setVolume(vol);
      },
      onTranscriptReceived: (text) => {
        const senderContainer = document.querySelector('[class*="sender"]');
        const textarea = senderContainer?.querySelector("textarea") as HTMLTextAreaElement | null;
        if (textarea) {
          const currentValue = textarea.value || "";
          const newValue = currentValue ? `${currentValue} ${text}` : text;
          // Set textarea value and trigger react onChange
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value"
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(textarea, newValue);
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            textarea.value = newValue;
          }
          textarea.focus();
        }
      },
      onWakeWordDetected: () => {
        // Triggered by wake word. Let's make sure we are listening
        console.log("[AetherVoiceButton] WakeWord detected!");
      },
      onStatusChanged: (newStatus) => {
        setStatus(newStatus);
      }
    });

    // Start listening automatically on load to allow WakeWord detection
    voiceService.initialize().then((ok) => {
      if (ok) {
        voiceService.startListening().then((started) => {
          setIsListening(started);
        });
      }
    });

    return () => {
      voiceService.stopListening();
    };
  }, []);

  const toggleVoiceMode = async () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
    } else {
      const started = await voiceService.startListening();
      setIsListening(started);
    }
  };

  const getButtonColor = () => {
    if (isListening) {
      // Return flat blue color, with opacity scaling by voice volume
      const volumeScale = Math.min(100, volume) / 100;
      return `rgba(22, 119, 255, ${0.4 + volumeScale * 0.6})`;
    }
    return undefined;
  };

  return (
    <Tooltip
      title={
        isListening
          ? `Voz Ativa: ${status}`
          : "Ativar Controle de Voz"
      }
      mouseEnterDelay={0.5}
    >
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        {isListening && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: "50%",
              boxShadow: `0 0 ${4 + (volume / 100) * 12}px #1677ff`,
              pointerEvents: "none",
              animation: "pulse-mic 1.5s infinite ease-in-out",
            }}
          />
        )}
        <IconButton
          bordered={false}
          icon={<AudioOutlined style={{ fontSize: "1.2em", color: getButtonColor() }} />}
          onClick={toggleVoiceMode}
          disabled={disabled}
          style={{
            color: isListening ? "#1677ff" : undefined,
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes pulse-mic {
            0% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 0.1; }
            100% { transform: scale(1); opacity: 0.5; }
          }
        `}} />
      </div>
    </Tooltip>
  );
};

export default AetherVoiceButton;
