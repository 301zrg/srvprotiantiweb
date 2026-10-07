import { Button, Drawer } from "antd";
import classNames from "classnames";
import { type ReactNode } from "react";

import { useMediaQuery, useMobileInterface } from "@/hook";
import { useI18N } from "@/ui/I18N";
import { mobileMessages } from "@/variant/mobileMessages";

import styles from "./index.module.scss";

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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  testId: string;
  zIndex?: number;
  bodyClassName?: string;
  placement?: "left" | "right" | "bottom";
}) {
  const mobile = useMobileInterface();
  const portrait = useMediaQuery("(orientation: portrait)");
  const { language } = useI18N();
  const bottom = placement === "bottom" || (mobile && portrait);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      zIndex={zIndex}
      placement={bottom ? "bottom" : placement}
      height={
        bottom
          ? "min(calc(var(--neos-adaptive-height, 100dvh) * 0.65), 620px)"
          : undefined
      }
      width={mobile ? "min(340px, 100vw)" : "340px"}
      mask={mobile}
      keyboard
      maskClosable
      rootClassName={classNames(styles.root, { [styles.docked]: !mobile })}
      className={styles.panel}
      extra={
        <Button data-testid={`${testId}-close`} onClick={onClose}>
          {mobileMessages(language).close}
        </Button>
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
