import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Spin } from "antd";
import { LoadingOutlined, DesktopOutlined, GlobalOutlined } from "@ant-design/icons";
import styles from "./index.module.less";

declare const VITE_API_BASE_URL: string;

export const CanvasBroadcastPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") || "auto"; // "auto" | "slides" | "browser"

  const [activeTab, setActiveTab] = useState<"slides" | "browser">("slides");
  const [slidesContent, setSlidesContent] = useState<string | null>(null);
  const [browserContent, setBrowserContent] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    // Fetch initial contents
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
        console.warn("[Broadcast] Failed to fetch initial canvas:", err);
        setSlidesContent("");
        setBrowserContent("");
      }
    };
    checkInitialCanvas();

    const connectWs = () => {
      setWsStatus("connecting");
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

      console.log("[Broadcast] Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Broadcast] WebSocket Connected");
        setWsStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[Broadcast] Received WS message:", data);
          if (data.type === "update") {
            const tab = data.tab || "slides";
            const html = data.html || "";
            if (tab === "browser") {
              setBrowserContent(html);
              if (tabParam === "auto") {
                setActiveTab("browser");
              }
            } else {
              setSlidesContent(html);
              if (tabParam === "auto") {
                setActiveTab("slides");
              }
            }
          }
        } catch (err) {
          console.error("[Broadcast] Error parsing WS message:", err);
        }
      };

      ws.onclose = () => {
        console.log("[Broadcast] WebSocket Closed. Reconnecting in 3s...");
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error("[Broadcast] WebSocket Error:", err);
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
  }, [tabParam]);

  // Set the correct active tab on query parameter changes
  useEffect(() => {
    if (tabParam === "slides") {
      setActiveTab("slides");
    } else if (tabParam === "browser") {
      setActiveTab("browser");
    }
  }, [tabParam]);

  const targetTab = tabParam === "auto" ? activeTab : (tabParam === "browser" ? "browser" : "slides");
  const currentContent = targetTab === "slides" ? slidesContent : browserContent;

  return (
    <div className={styles.broadcastContainer}>
      <div className={`${styles.statusOverlay} ${wsStatus === "connected" ? styles.connected : ""}`}>
        {wsStatus === "connected" ? "● Transmitindo" : "○ Conectando..."}
      </div>

      {currentContent !== null && currentContent !== "" ? (
        <iframe
          key={targetTab}
          srcDoc={currentContent}
          className={styles.broadcastFrame}
          title="Aether Broadcast Content"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
        />
      ) : (
        currentContent === null ? (
          <div className={styles.loadingState}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: "#1677ff" }} spin />} />
            <p>Carregando Transmissão...</p>
          </div>
        ) : (
          <div className={styles.emptyState}>
            {targetTab === "slides" ? (
              <>
                <DesktopOutlined className={styles.emptyIcon} />
                <h3>Aguardando Slides</h3>
                <p>Nenhuma apresentação ativa para transmissão no momento.</p>
              </>
            ) : (
              <>
                <GlobalOutlined className={styles.emptyIcon} />
                <h3>Aguardando Navegador</h3>
                <p>O assistente ainda não iniciou nenhuma navegação web.</p>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default CanvasBroadcastPage;
