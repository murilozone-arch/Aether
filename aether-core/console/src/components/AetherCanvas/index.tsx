import React, { useEffect, useState, useRef } from "react";

declare const VITE_API_BASE_URL: string;
import { useTheme } from "../../contexts/ThemeContext";
import { Badge, Spin } from "antd";
import { LoadingOutlined, DesktopOutlined, WifiOutlined, GlobalOutlined, ShareAltOutlined } from "@ant-design/icons";
import styles from "./index.module.less";

export interface AetherCanvasProps {
  className?: string;
}

export const AetherCanvas: React.FC<AetherCanvasProps> = ({ className }) => {
  const { isDark } = useTheme();
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [activeTab, setActiveTab] = useState<"slides" | "browser">("slides");
  const [slidesContent, setSlidesContent] = useState<string | null>(null);
  const [browserContent, setBrowserContent] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    // Check if there are existing canvas.html and browser.html files on the server
    const checkInitialCanvas = async () => {
      try {
        const [slidesResp, browserResp] = await Promise.all([
          fetch("/modules/canvas.html").catch(() => null),
          fetch("/modules/browser.html").catch(() => null),
        ]);

        if (slidesResp && slidesResp.ok) {
          const text = await slidesResp.text();
          setSlidesContent(text.trim() ? text : "");
        } else {
          setSlidesContent("");
        }

        if (browserResp && browserResp.ok) {
          const text = await browserResp.text();
          setBrowserContent(text.trim() ? text : "");
        } else {
          setBrowserContent("");
        }
      } catch (err) {
        console.warn("[AetherCanvas] Failed to fetch initial canvas:", err);
        setSlidesContent("");
        setBrowserContent("");
      }
    };
    checkInitialCanvas();

    const connectWs = () => {
      setWsStatus("connecting");
      
      // Determine WebSocket URL dynamically
      let wsUrl = "";
      try {
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
            const tab = data.tab || "slides";
            const html = data.html || "";
            if (tab === "browser") {
              setBrowserContent(html);
              setActiveTab("browser");
            } else {
              setSlidesContent(html);
              setActiveTab("slides");
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

  const currentContent = activeTab === "slides" ? slidesContent : browserContent;

  return (
    <div className={`${styles.canvasContainer} ${isDark ? styles.dark : ""} ${className || ""}`}>
      {/* Canvas Header */}
      <div className={styles.canvasHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Aether Canvas</span>
          <div className={styles.headerSeparator} />
          <div className={styles.tabList}>
            <button
              className={`${styles.tabItem} ${activeTab === "slides" ? styles.active : ""}`}
              onClick={() => setActiveTab("slides")}
            >
              <DesktopOutlined className={styles.tabIcon} />
              <span>Slides / Relatórios</span>
            </button>
            <button
              className={`${styles.tabItem} ${activeTab === "browser" ? styles.active : ""}`}
              onClick={() => setActiveTab("browser")}
            >
              <GlobalOutlined className={styles.tabIcon} />
              <span>Navegador Live</span>
            </button>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.broadcastButton}
            onClick={() => window.open(`/console/broadcast?tab=${activeTab}`, "_blank")}
            title="Transmitir esta aba para TV/Projetor"
          >
            <ShareAltOutlined />
            <span>Transmitir</span>
          </button>
          <WifiOutlined style={{ marginRight: 4, color: wsStatus === "connected" ? "#52c41a" : "#ff4d4f" }} />
          {getStatusBadge()}
        </div>
      </div>

      {/* Canvas Body */}
      <div className={styles.canvasBody}>
        {currentContent !== null && currentContent !== "" ? (
          <iframe
            key={activeTab} // Unique key per tab to force re-render when switching tabs
            srcDoc={currentContent}
            className={styles.canvasFrame}
            title={activeTab === "slides" ? "Aether Slides" : "Aether Live Browser"}
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          />
        ) : (
          currentContent === null ? (
            <div className={styles.emptyState}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: "#1677ff" }} spin />} />
              <p style={{ marginTop: 12 }}>Carregando {activeTab === "slides" ? "Slides" : "Navegador"}...</p>
            </div>
          ) : null
        )}

        {/* Fallback default UI when canvas is empty or not yet written */}
        {currentContent === "" && (
          <div className={styles.emptyState}>
            {activeTab === "slides" ? (
              <>
                <div className={styles.emptyVisual}>
                  <div className={styles.emptyCircle} />
                  <DesktopOutlined className={styles.emptyIcon} />
                </div>
                <h3>Slides / Relatórios</h3>
                <p>
                  Esta área exibe apresentações, gráficos, documentos e componentes interativos gerados em tempo real pelo seu assistente.
                </p>
                <div className={styles.canvasTip}>
                  Experimente dizer: <code>"Aether, crie um slide de apresentação sobre o projeto"</code>
                </div>
              </>
            ) : (
              <>
                <div className={styles.emptyVisual}>
                  <div className={styles.emptyCircle} />
                  <GlobalOutlined className={styles.emptyIcon} />
                </div>
                <h3>Navegador Live</h3>
                <p>
                  Esta área exibe em tempo real o navegador web utilizado pelo assistente para realizar testes, navegação e depuração.
                </p>
                <div className={styles.canvasTip}>
                  Experimente dizer: <code>"Aether, abra a página de login no navegador"</code>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AetherCanvas;
