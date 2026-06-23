import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  ReloadOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { Spin, Tooltip } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import styles from "./LiveBrowser.module.less";

declare const VITE_API_BASE_URL: string;

interface LiveBrowserProps {
  /** Initial URL to navigate to (pushed by agent via WebSocket) */
  agentUrl?: string | null;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

const PROXY_BASE = "/api/browser-proxy/fetch";

function buildProxyUrl(target: string): string {
  if (!target) return "";
  return `${PROXY_BASE}?url=${encodeURIComponent(target)}`;
}

function getWsBase(): string {
  try {
    const base =
      typeof VITE_API_BASE_URL !== "undefined" ? VITE_API_BASE_URL : "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (base && base.startsWith("http")) {
      const url = new URL(base);
      return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    }
    return `${protocol}//${window.location.host}`;
  } catch {
    return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
  }
}

export const LiveBrowser: React.FC<LiveBrowserProps> = ({ agentUrl }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const [displayUrl, setDisplayUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [addressBar, setAddressBar] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [privateMode, setPrivateMode] = useState(false);
  const [agentTitle, setAgentTitle] = useState("");

  // History stack for back/forward within the component
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  // -----------------------------------------------------------------------
  // Navigate helper
  // -----------------------------------------------------------------------
  const navigateTo = useCallback((target: string, pushHistory = true) => {
    if (!target) return;
    let url = target.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      // Treat bare strings as search queries if they look like search terms,
      // otherwise prepend https://
      if (url.includes(" ") || !url.includes(".")) {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      } else {
        url = `https://${url}`;
      }
    }
    setDisplayUrl(url);
    setAddressBar(url);
    setLoadState("loading");
    setIframeUrl(buildProxyUrl(url));

    if (pushHistory) {
      const stack = historyRef.current.slice(0, historyIdxRef.current + 1);
      stack.push(url);
      historyRef.current = stack;
      historyIdxRef.current = stack.length - 1;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Back / Forward
  // -----------------------------------------------------------------------
  const goBack = useCallback(() => {
    if (historyIdxRef.current > 0) {
      historyIdxRef.current--;
      const url = historyRef.current[historyIdxRef.current];
      navigateTo(url, false);
    }
  }, [navigateTo]);

  const goForward = useCallback(() => {
    if (historyIdxRef.current < historyRef.current.length - 1) {
      historyIdxRef.current++;
      const url = historyRef.current[historyIdxRef.current];
      navigateTo(url, false);
    }
  }, [navigateTo]);

  const reload = useCallback(() => {
    if (displayUrl) {
      setLoadState("loading");
      // Force iframe reload by toggling URL
      setIframeUrl("");
      setTimeout(() => setIframeUrl(buildProxyUrl(displayUrl)), 50);
    }
  }, [displayUrl]);

  // -----------------------------------------------------------------------
  // Agent URL sync (from parent WS message)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (agentUrl && agentUrl !== displayUrl) {
      navigateTo(agentUrl);
    }
  }, [agentUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Listen to messages from the proxied iframe (navigation bridge)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "aether_browser_nav") {
        const navUrl: string = e.data.url || "";
        // Don't update if it's a proxy URL itself
        if (!navUrl.includes("/api/browser-proxy/")) {
          setDisplayUrl(navUrl);
          setAddressBar(navUrl);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // -----------------------------------------------------------------------
  // WebSocket — subscribe to /ws/browser for agent navigation events
  // -----------------------------------------------------------------------
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let isMounted = true;

    const connect = () => {
      const ws = new WebSocket(`${getWsBase()}/ws/browser`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "navigate" && msg.url) {
            setAgentTitle(msg.title || "");
            navigateTo(msg.url);
          } else if (msg.type === "private_mode") {
            setPrivateMode(Boolean(msg.enabled));
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Address bar submit
  // -----------------------------------------------------------------------
  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(addressBar);
  };

  const canBack = historyIdxRef.current > 0;
  const canForward = historyIdxRef.current < historyRef.current.length - 1;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className={styles.liveBrowser}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.navButtons}>
          <Tooltip title="Voltar">
            <button
              className={styles.navBtn}
              onClick={goBack}
              disabled={!canBack}
              aria-label="Voltar"
            >
              <ArrowLeftOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Avançar">
            <button
              className={styles.navBtn}
              onClick={goForward}
              disabled={!canForward}
              aria-label="Avançar"
            >
              <ArrowRightOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Recarregar">
            <button
              className={`${styles.navBtn} ${loadState === "loading" ? styles.spinning : ""}`}
              onClick={reload}
              disabled={!displayUrl}
              aria-label="Recarregar"
            >
              <ReloadOutlined />
            </button>
          </Tooltip>
        </div>

        {/* Address bar */}
        <form className={styles.addressForm} onSubmit={handleAddressSubmit}>
          <span className={styles.lockIcon}>
            {displayUrl.startsWith("https://") ? (
              <LockOutlined style={{ color: "#52c41a" }} />
            ) : (
              <GlobalOutlined style={{ color: "#A0B2C6" }} />
            )}
          </span>
          <input
            ref={addressInputRef}
            className={styles.addressInput}
            value={addressBar}
            onChange={(e) => setAddressBar(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Digite uma URL ou pesquise…"
            spellCheck={false}
            autoComplete="off"
          />
          {loadState === "loading" && (
            <Spin
              indicator={
                <LoadingOutlined
                  style={{ fontSize: 14, color: "#1677ff" }}
                  spin
                />
              }
              style={{ marginRight: 8 }}
            />
          )}
        </form>

        {/* Private mode toggle */}
        <Tooltip
          title={
            privateMode
              ? "Modo Privado ATIVO — o agente não vê a tela"
              : "Ativar Modo Privado — oculta tela do agente"
          }
        >
          <button
            className={`${styles.navBtn} ${privateMode ? styles.privateModeActive : ""}`}
            onClick={() => setPrivateMode((v) => !v)}
            aria-label="Modo Privado"
          >
            {privateMode ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
        </Tooltip>
      </div>

      {/* Agent activity banner */}
      {agentTitle && (
        <div className={styles.agentBanner}>
          <GlobalOutlined style={{ marginRight: 6, color: "#79D7FF" }} />
          <span>
            Agente navegou para: <strong>{agentTitle || displayUrl}</strong>
          </span>
        </div>
      )}

      {/* Private mode overlay */}
      {privateMode && (
        <div className={styles.privateModeOverlay}>
          <EyeInvisibleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <h3>Modo Privado Ativo</h3>
          <p>O agente não pode ver o conteúdo desta aba.</p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            O que você digitar aqui não é transmitido ao modelo de IA.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!iframeUrl && !privateMode && (
        <div className={styles.emptyBrowser}>
          <div className={styles.emptyOrb} />
          <GlobalOutlined className={styles.emptyIcon} />
          <h3>Navegador Live</h3>
          <p>
            Digite uma URL na barra de endereços ou peça ao agente para abrir
            um site.
          </p>
          <div className={styles.quickLinks}>
            {["https://google.com", "https://github.com", "https://wikipedia.org"].map(
              (u) => (
                <button
                  key={u}
                  className={styles.quickLink}
                  onClick={() => navigateTo(u)}
                >
                  {u.replace("https://", "")}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* The iframe — proxy mode */}
      {iframeUrl && !privateMode && (
        <iframe
          ref={iframeRef}
          key={iframeUrl}
          src={iframeUrl}
          className={styles.browserFrame}
          title="Aether Live Browser"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          onLoad={() => {
            setLoadState("loaded");
            // Try to read title from iframe (may fail cross-origin even via proxy)
            try {
              const t = iframeRef.current?.contentDocument?.title;
              if (t) setAgentTitle(t);
            } catch {
              /* cross-origin blocked */
            }
          }}
          onError={() => setLoadState("error")}
        />
      )}
    </div>
  );
};

export default LiveBrowser;
