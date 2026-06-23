import React, { useState, useEffect } from "react";
import { Tooltip } from "antd";
import { SoundOutlined, MutedOutlined } from "@ant-design/icons";
import { IconButton } from "@agentscope-ai/design";
import { useTheme } from "../../contexts/ThemeContext";
import consoleTtsService from "../../services/consoleTtsService";

export const AetherTtsButton: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const { isDark } = useTheme();

  useEffect(() => {
    setEnabled(consoleTtsService.isEnabled());
  }, []);

  const toggleTts = () => {
    const nextState = !enabled;
    consoleTtsService.setEnabled(nextState);
    setEnabled(nextState);
  };

  const getIconColor = () => {
    if (enabled) return "#1677ff";
    return isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.25)";
  };

  return (
    <Tooltip title={enabled ? "Desativar Fala por Voz (TTS)" : "Ativar Fala por Voz (TTS)"} mouseEnterDelay={0.5}>
      <IconButton
        bordered={false}
        icon={enabled ? <SoundOutlined style={{ fontSize: "1.2em", color: getIconColor() }} /> : <MutedOutlined style={{ fontSize: "1.2em", color: getIconColor() }} />}
        onClick={toggleTts}
        style={{
          color: enabled ? "#1677ff" : undefined,
        }}
      />
    </Tooltip>
  );
};

export default AetherTtsButton;
