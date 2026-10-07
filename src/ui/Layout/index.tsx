import { SettingOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useRouteError } from "react-router-dom";
import { useSnapshot } from "valtio";

import { useAdaptiveViewportScale } from "@/hook";
import {
  freshPageUrl,
  repairPageAssets,
  ResourceLoadError,
} from "@/infra/resource";
import { initStore } from "@/stores";
import { basePath, environmentId } from "@/variant";
import { connectionStore } from "@/variant/connection";
import { siteStorage } from "@/variant/deployment";
import { siteMessages } from "@/variant/messages";

import { setCssProperties } from "../Duel/PlayMat/css";
import { I18NSelector, useI18N } from "../I18N";
import { disconnectSrvpro } from "../Match/util";
import { openSettingPanel, SettingPanel } from "../Setting";
import styles from "./index.module.scss";
import { initDeck, initForbidden, initI18N, initSqlite } from "./utils";

export const loader = async () => {
  const results = await Promise.allSettled([
    initDeck(),
    initSqlite(),
    initForbidden(),
    initI18N(),
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  setCssProperties();
  return null;
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  const text = siteMessages(siteStorage.getItem("language") ?? "en");
  useEffect(() => disconnectSrvpro(), []);
  const [retrying, setRetrying] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const retry = async () => {
    setRetrying(true);
    setRecoveryError("");
    try {
      if (
        error instanceof ResourceLoadError &&
        error.resource.startsWith("Page:")
      )
        await repairPageAssets(basePath);
      location.replace(freshPageUrl());
    } catch (failure) {
      setRecoveryError(
        failure instanceof Error ? failure.message : String(failure),
      );
      setRetrying(false);
    }
  };
  return (
    <div
      role="alert"
      data-testid="page-load-error"
      style={{ maxWidth: 600, margin: "10vh auto", padding: 24 }}
    >
      <h1>
        {error instanceof ResourceLoadError ? text.loadFailed : text.pageFailed}
      </h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <p>{text.recoveryHint}</p>
      {recoveryError && <p role="status">{recoveryError}</p>}
      <Button
        data-testid="retry-page-load"
        type="primary"
        loading={retrying}
        onClick={retry}
      >
        {text.retry}
      </Button>
      <Button
        style={{ marginLeft: 12 }}
        onClick={() => location.replace(freshPageUrl(true))}
      >
        {text.back}
      </Button>
    </div>
  );
};

export const Component = () => {
  const { pathname } = useLocation();
  // HUD and portal overlays always retain their physical touch target sizes.
  // Only the duel board scales inside its own available area.
  useAdaptiveViewportScale({
    designWidth: 390,
    designHeight: 620,
    minScale: 1,
  });
  const hideHeader = ["/waitroom", "/duel", "/side"].includes(pathname);
  const connection = useSnapshot(connectionStore);
  const { language } = useI18N();
  const text = siteMessages(language);

  return (
    <>
      <SettingPanel />
      {!hideHeader && (
        <nav className={styles.navbar} aria-label="主导航">
          <NavLink to="/" className={styles["logo-container"]}>
            <strong
              style={{ color: "white", fontSize: 16, whiteSpace: "nowrap" }}
            >
              706 YGOPRO
            </strong>
          </NavLink>
          <NavLink to="/match" className={styles.link}>
            {text.connect}
          </NavLink>
          <NavLink to="/build" className={styles.link}>
            {text.decks}
          </NavLink>
          <span style={{ flexGrow: 1 }} />
          <I18NSelector />
          <Button
            data-testid="open-settings"
            aria-label={text.settings}
            icon={<SettingOutlined />}
            size="small"
            onClick={() => openSettingPanel({})}
          >
            <span className={styles.settingsLabel}>{text.settings}</span>
          </Button>
        </nav>
      )}
      {hideHeader && pathname !== "/duel" && pathname !== "/waitroom" && (
        <div className={styles.localeFloating}>
          <I18NSelector />
        </div>
      )}
      <main
        className={styles.main}
        data-environment={environmentId}
        data-ready={initStore.sqlite.progress === 1}
      >
        {connection.state === "disconnected" &&
          pathname !== "/match" &&
          createPortal(
            <div
              role="alert"
              data-testid="connection-alert"
              className={styles.connectionAlert}
            >
              <span>{connection.detail}</span>
              <NavLink to="/match">{text.back}</NavLink>
            </div>,
            document.body,
          )}
        <Outlet key={pathname} />
      </main>
    </>
  );
};
