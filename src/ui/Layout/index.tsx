import { App, Button } from "antd";
import { NavLink, Outlet, useLocation, useRouteError } from "react-router-dom";
import { useSnapshot } from "valtio";

import { useAdaptiveViewportScale } from "@/hook";
import { initStore } from "@/stores";
import { environmentId } from "@/variant";
import { connectionStore } from "@/variant/connection";
import { siteMessages } from "@/variant/messages";

import { setCssProperties } from "../Duel/PlayMat/css";
import { I18NSelector, useI18N } from "../I18N";
import { Setting } from "../Setting";
import styles from "./index.module.scss";
import { initDeck, initForbidden, initI18N, initSqlite } from "./utils";

export const loader = async () => {
  await Promise.all([initDeck(), initSqlite(), initForbidden(), initI18N()]);
  setCssProperties();
  return null;
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  const text = siteMessages(localStorage.getItem("language") ?? "en");
  return (
    <div
      role="alert"
      style={{ maxWidth: 600, margin: "10vh auto", padding: 24 }}
    >
      <h1>{text.loadFailed}</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <Button onClick={() => location.reload()}>{text.retry}</Button>
    </div>
  );
};

export const Component = () => {
  const { pathname } = useLocation();
  const inDuel = pathname === "/duel";
  useAdaptiveViewportScale(
    inDuel
      ? { designWidth: 1000, designHeight: 920 }
      : { designWidth: 390, designHeight: 620, minScale: 1 },
  );
  const hideHeader = ["/waitroom", "/duel", "/side"].includes(pathname);
  const { modal } = App.useApp();
  const connection = useSnapshot(connectionStore);
  const { language } = useI18N();
  const text = siteMessages(language);

  return (
    <>
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
            size="small"
            onClick={() =>
              modal.info({
                content: <Setting />,
                icon: null,
                footer: null,
                width: 460,
              })
            }
          >
            {text.settings}
          </Button>
        </nav>
      )}
      {hideHeader && (
        <div className={styles.localeFloating}>
          <I18NSelector />
        </div>
      )}
      <main
        className={styles.main}
        data-environment={environmentId}
        data-ready={initStore.sqlite.progress === 1}
      >
        {connection.state === "disconnected" && pathname !== "/match" && (
          <div
            role="alert"
            style={{
              position: "fixed",
              top: 12,
              left: 12,
              right: 12,
              zIndex: 1000,
              padding: 12,
              background: "#812323",
              color: "white",
            }}
          >
            {connection.detail} <NavLink to="/match">{text.back}</NavLink>
          </div>
        )}
        <Outlet key={pathname === "/build" ? language : pathname} />
      </main>
    </>
  );
};
