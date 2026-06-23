import React, { useEffect, useState, useRef } from "react";

declare const VITE_API_BASE_URL: string;
import { useTheme } from "../../contexts/ThemeContext";
import { Badge, Spin } from "antd";
import {
  LoadingOutlined,
  DesktopOutlined,
  WifiOutlined,
  GlobalOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import styles from "./index.module.less";
import { LiveBrowser } from "./LiveBrowser";

export interface AetherCanvasProps {
  className?: string;
}

export const AetherCanvas: React.FC<AetherCanvasProps> = ({ className }) => {
  const { isDark } = useTheme();
  const [wsStatus, setWsStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [activeTab, setActiveTab] = useState<"slides" | "browser">("slides");
  const [slidesContent, setSlidesContent] = useState<string | null>(null);

  // Agent-driven URL pushed via /ws/canvas (browser_navigate messages)
  const [agentBrowserUrl, setAgentBrowserUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    // Check if there are existing canvas.html slides on the server
    const checkInitialCanvas = async () => {
      try {
        const slidesResp = await fetch("/modules/canvas.html").catch(
          () => null
        );
        if (slidesResp && slidesResp.ok) {
          const text = await slidesResp.text();
          setSlidesContent(text.trim() ? text : "");
        } else {
          setSlidesContent("");
        }
      } catch {
        setSlidesContent("");
      }
    };
    checkInitialCanvas();

    const connectWs = () => {
      setWsStatus("connecting");

      let wsUrl = "";
      try {
        const base =
          typeof VITE_API_BASE_URL !== "undefined" ? VITE_API_BASE_URL : "";
        const protocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";

        if (base && base.startsWith("http")) {
          const url = new URL(base);
          const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
          wsUrl = `${wsProtocol}//${url.host}/ws/canvas`;
        } else {
          wsUrl = `${protocol}//${window.location.host}/ws/canvas`;
        }
      } catch {
        wsUrl = `${
          window.location.protocol === "https:" ? "wss:" : "ws:"
        }//${window.location.host}/ws/canvas`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("connected");

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "update") {
            // Slide/presentation update
            const tab = data.tab || "slides";
            const html = data.html || "";
            if (tab === "slides") {
              setSlidesContent(html);
              setActiveTab("slides");
            }
            // "browser" tab updates via srcDoc are replaced by LiveBrowser
          } else if (data.type === "browser_navigate") {
            // Agent navigated — update LiveBrowser URL and switch to browser tab
            setAgentBrowserUrl(data.url || null);
            setActiveTab("browser");
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
      ws.onerror = () => ws.close();
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
        return (
          <Badge
            status="success"
            text="Canal Ativo"
            style={{
              color: isDark
                ? "rgba(255,255,255,0.65)"
                : "rgba(0,0,0,0.45)",
            }}
          />
        );
      case "connecting":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "#1677ff",
            }}
          >
            <Spin
              indicator={
                <LoadingOutlined
                  style={{ fontSize: 12, color: "#1677ff" }}
                  spin
                />
              }
              size="small"
            />
            Conectando...
          </span>
        );
      default:
        return (
          <Badge
            status="error"
            text="Desconectado"
            style={{
              color: isDark
                ? "rgba(255,255,255,0.65)"
                : "rgba(0,0,0,0.45)",
            }}
          />
        );
    }
  };

  return (
    <div
      className={`${styles.canvasContainer} ${isDark ? styles.dark : ""} ${
        className || ""
      }`}
    >
      {/* ── Canvas Header ── */}
      <div className={styles.canvasHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Aether Canvas</span>
          <div className={styles.headerSeparator} />
          <div className={styles.tabList}>
            <button
              className={`${styles.tabItem} ${
                activeTab === "slides" ? styles.active : ""
              }`}
              onClick={() => setActiveTab("slides")}
            >
              <DesktopOutlined className={styles.tabIcon} />
              <span>Slides / Relatórios</span>
            </button>
            <button
              className={`${styles.tabItem} ${
                activeTab === "browser" ? styles.active : ""
              }`}
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
            onClick={() =>
              window.open(`/console/broadcast?tab=${activeTab}`, "_blank")
            }
            title="Transmitir esta aba para TV/Projetor"
          >
            <ShareAltOutlined />
            <span>Transmitir</span>
          </button>
          <WifiOutlined
            style={{
              marginRight: 4,
              color: wsStatus === "connected" ? "#52c41a" : "#ff4d4f",
            }}
          />
          {getStatusBadge()}
        </div>
      </div>

      {/* ── Canvas Body ── */}
      <div className={styles.canvasBody}>
        {/* Slides tab */}
        {activeTab === "slides" && (
          <>
            {slidesContent !== null && slidesContent !== "" ? (
              <iframe
                srcDoc={slidesContent}
                className={styles.canvasFrame}
                title="Aether Slides"
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
              />
            ) : slidesContent === null ? (
              <div className={styles.emptyState}>
                <Spin
                  indicator={
                    <LoadingOutlined
                      style={{ fontSize: 24, color: "#1677ff" }}
                      spin
                    />
                  }
                />
                <p style={{ marginTop: 12 }}>Carregando Slides...</p>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyVisual}>
                  <div className={styles.emptyCircle} />
                  <DesktopOutlined className={styles.emptyIcon} />
                </div>
                <h3>Slides / Relatórios</h3>
                <p>
                  Esta área exibe apresentações, gráficos, documentos e
                  componentes interativos gerados em tempo real pelo seu
                  assistente.
                </p>
                <div className={styles.canvasTip}>
                  Experimente dizer:{" "}
                  <code>
                    &quot;Aether, crie um slide de apresentação sobre o
                    projeto&quot;
                  </code>
                </div>
              </div>
            )}
          </>
        )}

        {/* Browser tab — LiveBrowser with proxy + WebSocket sync */}
        {activeTab === "browser" && (
          <LiveBrowser agentUrl={agentBrowserUrl} />
        )}
      </div>
    </div>
  );
};

export default AetherCanvas;
