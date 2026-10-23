import { CloseOutlined } from "@ant-design/icons";
import { Button, Drawer } from "antd";
import classNames from "classnames";
import { createContext, type ReactNode, useContext } from "react";
import { useSnapshot } from "valtio";

import { useMediaQuery, useMobileInterface } from "@/hook";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { mobileMessages } from "@/variant/mobileMessages";

import styles from "./index.module.scss";

export const DuelSidebarContext = createContext(false);
export const duelSidebarQuery =
  "(orientation: landscape) and (min-width: 480px)";

export const hasDuelSidebar = () =>
  !!document.querySelector('[data-duel-sidebar="true"]');

/** Responsive auxiliary panel: native-size controls outside the scaled board. */
export function DuelPanel({
  open,
  onClose,
  title,
  children,
  testId,
  zIndex,
  bodyClassName,
  placement = "right",
  compact = false,
  closeControl = "button",
  desktopWidth = "340px",
  followControlSide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  testId: string;
  zIndex?: number;
  bodyClassName?: string;
  placement?: "left" | "right" | "bottom";
  /** Nonblocking card inspector/list; leave the duel controls accessible. */
  compact?: boolean;
  closeControl?: "button" | "icon";
  desktopWidth?: string;
  followControlSide?: boolean;
}) {
  const mobile = useMobileInterface();
  const { controlPanelSide } = useSnapshot(settingStore);
  const sidebar = useContext(DuelSidebarContext);
  const shortSidebar = useMediaQuery(
    "(orientation: landscape) and (max-height: 600px)",
  );
  const portrait = useMediaQuery("(orientation: portrait)");
  const { language } = useI18N();
  const bottom =
    !sidebar &&
    !followControlSide &&
    (placement === "bottom" || (mobile && portrait));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      zIndex={zIndex}
      placement={
        sidebar || followControlSide
          ? controlPanelSide
          : bottom
          ? "bottom"
          : mobile && compact
          ? "right"
          : placement
      }
      height={
        bottom
          ? compact && mobile
            ? "min(calc(var(--neos-adaptive-height, 100dvh) * 0.34), 300px)"
            : "min(calc(var(--neos-adaptive-height, 100dvh) * 0.65), 620px)"
          : undefined
      }
      width={
        sidebar
          ? "var(--duel-sidebar-width, 280px)"
          : mobile
          ? `min(${compact ? 280 : 340}px, 100vw)`
          : desktopWidth
      }
      mask={!sidebar && mobile && !compact}
      rootStyle={
        sidebar
          ? {
              top: shortSidebar
                ? "max(8px, env(safe-area-inset-top))"
                : "var(--duel-sidebar-content-top, 180px)",
              bottom: shortSidebar
                ? "max(8px, env(safe-area-inset-bottom))"
                : 0,
              left: controlPanelSide === "left" ? 0 : "auto",
              right: controlPanelSide === "right" ? 0 : "auto",
              width: "var(--duel-sidebar-width, 280px)",
              height: "auto",
            }
          : undefined
      }
      keyboard
      maskClosable
      rootClassName={classNames(styles.root, {
        [styles.docked]: !mobile && !sidebar,
        [styles.compact]: mobile && compact && !sidebar,
        [styles.sidebar]: sidebar,
      })}
      className={styles.panel}
      closable={
        closeControl === "icon"
          ? {
              closeIcon: (
                <span
                  className={styles.iconClose}
                  data-testid={`${testId}-close`}
                >
                  <CloseOutlined />
                </span>
              ),
              "aria-label": mobileMessages(language).close,
            }
          : !compact
      }
      extra={
        closeControl === "button" ? (
          <Button data-testid={`${testId}-close`} onClick={onClose}>
            {mobileMessages(language).close}
          </Button>
        ) : undefined
      }
    >
      <div
        className={classNames(styles.body, bodyClassName)}
        data-testid={testId}
      >
        {children}
      </div>
    </Drawer>
  );
}
