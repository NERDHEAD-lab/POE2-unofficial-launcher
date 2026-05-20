import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";

import AliasDialog from "./AliasDialog";
import { RemoteFontItem } from "../../../main/services/SyncEngine";
import { UnifiedFontData } from "../../../shared/types";
import { Toast } from "../ui/Toast";
import "./FontCatalogModal.css";

interface FontCatalogModalProps {
  isVisible: boolean;
  onClose: () => void;
  onFontInstalled: () => void;
}

const FontCatalogModal: React.FC<FontCatalogModalProps> = ({
  isVisible,
  onClose,
  onFontInstalled,
}) => {
  const [catalog, setCatalog] = useState<RemoteFontItem[]>([]);
  const [installedFonts, setInstalledFonts] = useState<UnifiedFontData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingItem, setPendingItem] = useState<RemoteFontItem | null>(null);
  const [isAliasOpen, setIsAliasOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // [v13] 언어 설정 상태
  const [currentLang, setCurrentLang] = useState<string>("ko");

  const [toastMsg, setToastMsg] = useState("");
  const [toastVariant, setToastVariant] = useState<
    "default" | "success" | "warning" | "error" | "white"
  >("default");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const [modalEl, setModalEl] = useState<HTMLDivElement | null>(null);

  const [pendingLocalPath, setPendingLocalPath] = useState<string | null>(null);
  const [analyzedLocalName, setAnalyzedLocalName] = useState("");
  const [isLocalAliasOpen, setIsLocalAliasOpen] = useState(false);

  // [v13] 텍스트 추출 헬퍼 (Fallback: ko/en -> en -> first)
  const getLabel = useCallback(
    (data: { [langCode: string]: string } | undefined, lang: string) => {
      if (!data) return "";
      return data[lang] || data["en"] || Object.values(data)[0] || "";
    },
    [],
  );

  const showToast = useCallback(
    (
      msg: string,
      variant:
        | "default"
        | "success"
        | "warning"
        | "error"
        | "white" = "default",
    ) => {
      setToastMsg(msg);
      setToastVariant(variant);
      setToastVisible(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000);
    },
    [],
  );

  const loadCatalog = useCallback(async (force: boolean = false) => {
    if (force) setIsSyncing(true);
    else setIsLoading(true);

    setErrorMsg(null);
    try {
      // 설치된 폰트 및 설정 언어 동시 로드
      const [installed, lang] = await Promise.all([
        window.electronAPI.font.getUnifiedFonts(),
        window.electronAPI.getConfig("language") as Promise<string>,
      ]);

      await window.electronAPI.font.syncCatalog(force);
      const catalog = await window.electronAPI.font.getCatalog();

      setInstalledFonts(installed);
      setCurrentLang(lang || "ko");
      setCatalog(catalog || []);

      if (!catalog || catalog.length === 0) {
        setErrorMsg(
          "폰트 목록을 가져올 수 없습니다. 서버 상태를 확인해 주세요.",
        );
      }
    } catch (_err) {
      setErrorMsg("원격 카탈로그 동기화 실패. 오프라인 상태일 수 있습니다.");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // [v16] 실시간 검색 필터링 로직 (Multi-language Support)
  const filteredCatalog = useMemo(() => {
    if (!searchTerm.trim()) return catalog;

    const term = searchTerm.toLowerCase().trim();
    return catalog.filter((item) => {
      // 1. Full Names (ko, en 등 모든 언어) 검색
      const matchName = Object.values(item.fullNames).some((val) =>
        val.toLowerCase().includes(term),
      );
      if (matchName) return true;

      // 2. Family Names 검색
      const matchFamily = Object.values(item.familyNames).some((val) =>
        val.toLowerCase().includes(term),
      );
      if (matchFamily) return true;

      // 3. ID(Hash) 검색
      if (item.id.toLowerCase().includes(term)) return true;

      return false;
    });
  }, [catalog, searchTerm]);

  useEffect(() => {
    if (isVisible) {
      // Deferred via microtask so the synchronous setIsLoading inside loadCatalog
      // doesn't trigger a cascading render from this effect.
      void Promise.resolve().then(() => loadCatalog());
    }
  }, [isVisible, loadCatalog]);

  useEffect(() => {
    const removeListener = window.electronAPI.font.onDownloadProgress(
      (data: { id: string; progress: number }) => {
        if (downloadingId === data.id) {
          setDownloadProgress(data.progress);
        }
      },
    );
    return () => removeListener();
  }, [downloadingId]);

  const handleManualAdd = async () => {
    try {
      const filePath = await window.electronAPI.font.pickFontFile();
      if (!filePath) return;

      setIsProcessing(true);
      const metadata = await window.electronAPI.font.analyzeFile(filePath);

      const isDuplicate = installedFonts.some(
        (f) => f.originalName === metadata.originalName,
      );

      if (isDuplicate) {
        showToast(
          `동일한 폰트('${metadata.originalName}')가 이미 라이브러리에 등록되어 있습니다.`,
          "error",
        );
        setIsProcessing(false);
        return;
      }

      setPendingLocalPath(filePath);
      setAnalyzedLocalName(metadata.originalName);
      setIsLocalAliasOpen(true);
      setIsProcessing(false);
    } catch {
      showToast("유효하지 않은 폰트 파일입니다.", "error");
      setIsProcessing(false);
    }
  };

  const confirmLocalAdd = async (customAlias: string) => {
    if (!pendingLocalPath) return;
    setIsLocalAliasOpen(false);

    try {
      setIsProcessing(true);
      await window.electronAPI.font.addFont(
        pendingLocalPath,
        undefined,
        customAlias,
      );
      onFontInstalled();
      await loadCatalog(true);
      showToast("로컬 폰트가 성공적으로 등록되었습니다.", "success");
    } catch {
      showToast("폰트 등록 중 오류가 발생했습니다.", "error");
    } finally {
      setIsProcessing(false);
      setPendingLocalPath(null);
      setAnalyzedLocalName("");
    }
  };

  const handleDownloadClick = (item: RemoteFontItem) => {
    const isInstalled = installedFonts.some(
      (f) => f.remoteSourceId === item.id,
    );
    if (isInstalled) return;

    setPendingItem(item);
    setIsAliasOpen(true);
  };

  const confirmDownload = async (customAlias: string) => {
    if (!pendingItem) return;
    setIsAliasOpen(false);
    setDownloadingId(pendingItem.id);
    setIsProcessing(true);

    try {
      await window.electronAPI.font.downloadRemote(pendingItem, customAlias);
      showToast("폰트 설치가 완료되었습니다.", "success");
    } catch {
      showToast("폰트 설치 중 오류가 발생했습니다.", "error");
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
      setIsProcessing(false);
      setPendingItem(null);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`font-catalog-overlay ${isVisible ? "visible" : ""}`}
      onClick={onClose}
    >
      <div
        className="font-catalog-modal"
        onClick={(e) => e.stopPropagation()}
        ref={setModalEl}
      >
        <Toast
          message={toastMsg}
          visible={toastVisible}
          container={modalEl}
          variant={toastVariant}
        />
        <header className="catalog-header">
          <div className="catalog-header-info">
            <h2>새 폰트 추가</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              className={`catalog-refresh-btn ${isSyncing ? "spinning" : ""}`}
              onClick={() => !isSyncing && loadCatalog(true)}
              title="동기화 갱신"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button className="catalog-close-btn" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>

        <section className="catalog-search-section">
          <div className="search-bar-inner">
            <span className="material-symbols-outlined search-icon">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="catalog-search-input"
            />
            {searchTerm && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchTerm("")}
                title="검색어 초기화"
              >
                <span className="material-symbols-outlined">backspace</span>
              </button>
            )}
          </div>
        </section>

        <main className="catalog-content">
          {isLoading ? (
            <div className="catalog-status">목록을 불러오는 중...</div>
          ) : errorMsg ? (
            <div className="catalog-status error">{errorMsg}</div>
          ) : filteredCatalog.length === 0 ? (
            <div className="catalog-status empty">
              <span className="material-symbols-outlined status-icon">
                search_off
              </span>
              <p>검색 결과가 없습니다.</p>
              <small>다른 검색어를 입력해 보세요.</small>
            </div>
          ) : (
            <div className="catalog-grid">
              {filteredCatalog.map((item) => {
                const isInstalled = installedFonts.some(
                  (f) => f.remoteSourceId === item.id,
                );
                return (
                  <FontCard
                    key={item.id}
                    item={item}
                    currentLang={currentLang}
                    getLabel={getLabel}
                    isInstalled={isInstalled}
                    isDownloading={downloadingId === item.id}
                    progress={downloadProgress}
                    onDownload={() => handleDownloadClick(item)}
                  />
                );
              })}
            </div>
          )}
        </main>

        <footer className="catalog-footer">
          <div className="footer-left">
            <button className="manual-add-btn" onClick={handleManualAdd}>
              <span className="material-symbols-outlined">upload_file</span>
              <span>수동 파일 추가</span>
            </button>
          </div>
          <button className="catalog-close-main" onClick={onClose}>
            닫기
          </button>
        </footer>

        {isProcessing && (
          <div className="font-loading-overlay">
            <div className="font-loading-content">
              <div className="font-spinner"></div>
              <p>폰트를 라이브러리에 추가하는 중...</p>
              <small>서버에서 파일을 받아 정보를 분석하고 있습니다.</small>
            </div>
          </div>
        )}

        {isAliasOpen && pendingItem && (
          <AliasDialog
            key={pendingItem.id}
            isVisible={true}
            title="폰트 추가 - 별칭 지정"
            defaultAlias={getLabel(pendingItem.fullNames, currentLang)}
            onConfirm={confirmDownload}
            onCancel={() => {
              setIsAliasOpen(false);
              setPendingItem(null);
            }}
          />
        )}

        {isLocalAliasOpen && analyzedLocalName && (
          <AliasDialog
            key={pendingLocalPath}
            isVisible={true}
            title="수동 폰트 추가 - 별칭 지정"
            defaultAlias={analyzedLocalName}
            onConfirm={confirmLocalAdd}
            onCancel={() => {
              setIsLocalAliasOpen(true);
              setPendingLocalPath(null);
              setAnalyzedLocalName("");
            }}
          />
        )}
      </div>
    </div>
  );
};

interface FontCardProps {
  item: RemoteFontItem;
  currentLang: string;
  getLabel: (
    data: { [lang: string]: string } | undefined,
    lang: string,
  ) => string;
  isInstalled: boolean;
  isDownloading: boolean;
  progress: number;
  onDownload: () => void;
}

const FontCard: React.FC<FontCardProps> = ({
  item,
  currentLang,
  getLabel,
  isInstalled,
  isDownloading,
  progress,
  onDownload,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const fullName = getLabel(item.fullNames, currentLang);
  const familyName = getLabel(item.familyNames, currentLang);
  const previewUrl = `https://nerdhead-lab.github.io/POE2-unofficial-launcher/fonts/${item.previewPath}`;
  const fileSizeMB = (item.fileSize / (1024 * 1024)).toFixed(1);
  const licenseText = getLabel(item.license, currentLang);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (cardRef.current) obs.observe(cardRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="font-card" ref={cardRef}>
      <div className={`font-card-preview ${imgLoaded ? "has-image" : ""}`}>
        {isVisible ? (
          <img
            src={previewUrl}
            alt={fullName}
            className={imgLoaded ? "loaded" : ""}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = "";
              target.className = "error-img";
            }}
          />
        ) : (
          <div className="placeholder">썸네일 로딩 중...</div>
        )}
      </div>
      <div className="font-card-info">
        <div className="font-card-details">
          <div className="font-card-name" title={fullName}>
            {fullName}
            <span className="font-card-id-sub"> - {familyName}</span>
          </div>
          <div className="font-card-meta">
            <span>{fileSizeMB} MB</span>
            <span>•</span>
            <span
              className={`font-card-license ${item.licenseUrl ? "has-link" : ""}`}
              title={licenseText || item.licenseUrl || "No license info"}
              onClick={() => {
                if (item.licenseUrl) {
                  window.open(item.licenseUrl, "_blank");
                }
              }}
            >
              {(() => {
                const isUnknown =
                  !licenseText ||
                  licenseText.toLowerCase() === "unknown license";
                const displayLicense = isUnknown
                  ? item.licenseUrl
                    ? "Link"
                    : "Unknown License"
                  : licenseText;
                return displayLicense.length > 25
                  ? displayLicense.substring(0, 25) + "..."
                  : displayLicense;
              })()}
            </span>
          </div>
        </div>

        <button
          className={`font-card-btn ${isInstalled ? "installed" : "download-ready"}`}
          disabled={isInstalled || isDownloading}
          onClick={onDownload}
        >
          {isDownloading && (
            <div
              className="card-progress-bar"
              style={{ width: `${progress}%` }}
            ></div>
          )}
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px" }}
          >
            {isInstalled
              ? "check_circle"
              : isDownloading
                ? "downloading"
                : "download"}
          </span>
          <span>
            {isInstalled
              ? "이미 설치됨"
              : isDownloading
                ? "다운로드 중..."
                : "추가"}
          </span>
        </button>
      </div>
    </div>
  );
};

export default FontCatalogModal;
