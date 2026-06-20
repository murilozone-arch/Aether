import React, { useEffect, useState, useRef } from "react";

declare const VITE_API_BASE_URL: string;
import { useTheme } from "../../contexts/ThemeContext";
import { Badge, Spin } from "antd";
import { LoadingOutlined, DesktopOutlined, WifiOutlined } from "@ant-design/icons";
import styles from "./index.module.less";

export interface AetherCanvasProps {
  className?: string;
}

export const AetherCanvas: React.FC<AetherCanvasProps> = ({ className }) => {
  const { isDark } = useTheme();
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connectWs = () => {
      setWsStatus("connecting");
      
      // Determine WebSocket URL dynamically
      let wsUrl = "";
      try {
        // If VITE_API_BASE_URL is defined, use it to construct WS url
        // Otherwise use same host
        const base = typeof VITE_API_BASE_URL !== "undefined" ? VITE_API_BASE_URL : "";
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        
        if (base && base.startsWith("http")) {
          const url = new URL(base);
          const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${wsProtocol}//${url.host}/ws/canvas`;
        } else {
          wsUrl = `${protocol}//${window.location.host}/ws/canvas`;
        }
      } catch (e) {
        wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/canvas`;
      }

      console.log("[AetherCanvas] Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[AetherCanvas] WebSocket Connected");
        setWsStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[AetherCanvas] Received WS message:", data);
          if (data.type === "update") {
            if (data.html) {
              setHtmlContent(data.html);
            } else {
              setHtmlContent(null);
              setIframeKey((prev) => prev + 1);
            }
          }
        } catch (err) {
          console.error("[AetherCanvas] Error parsing WS message:", err);
        }
      };

      ws.onclose = () => {
        console.log("[AetherCanvas] WebSocket Closed. Attempting reconnect in 3s...");
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error("[AetherCanvas] WebSocket Error:", err);
        ws.close();
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        // Disable onclose handler to prevent reconnect loop during unmount
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const getStatusBadge = () => {
    switch (wsStatus) {
      case "connected":
        return <Badge status="success" text="Canal Ativo" style={{ color: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.45)" }} />;
      case "connecting":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#1677ff" }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 12, color: "#1677ff" }} spin />} size="small" />
            Conectando...
          </span>
        );
      case "disconnected":
      default:
        return <Badge status="error" text="Desconectado" style={{ color: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.45)" }} />;
    }
  };

  return (
    <div className={`${styles.canvasContainer} ${isDark ? styles.dark : ""} ${className || ""}`}>
      {/* Canvas Header */}
      <div className={styles.canvasHeader}>
        <div className={styles.headerLeft}>
          <DesktopOutlined className={styles.headerIcon} />
          <span className={styles.headerTitle}>Aether Canvas</span>
        </div>
        <div className={styles.headerRight}>
          <WifiOutlined style={{ marginRight: 4, color: wsStatus === "connected" ? "#52c41a" : "#ff4d4f" }} />
          {getStatusBadge()}
        </div>
      </div>

      {/* Canvas Body */}
      <div className={styles.canvasBody}>
        {htmlContent !== null ? (
          <iframe
            key={`doc-${iframeKey}`}
            srcDoc={htmlContent}
            className={styles.canvasFrame}
            title="Aether Dynamic Content"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          />
        ) : (
          <iframe
            key={`src-${iframeKey}`}
            src="/modules/canvas.html"
            className={styles.canvasFrame}
            title="Aether Static Content"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
            onError={() => setHtmlContent("")} // fallback if file not exists
          />
        )}

        {/* Fallback default UI when canvas is empty or not yet written */}
        {htmlContent === "" && (
          <div className={styles.emptyState}>
            <div className={styles.emptyVisual}>
              <div className={styles.emptyCircle} />
              <DesktopOutlined className={styles.emptyIcon} />
            </div>
            <h3>Canvas do Aether</h3>
            <p>
              Esta área exibe apresentações, gráficos, documentos e componentes interativos gerados em tempo real pelo seu assistente.
            </p>
            <div className={styles.canvasTip}>
              Experimente dizer: <code>"Aether, crie um slide de apresentação sobre o projeto"</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AetherCanvas;
