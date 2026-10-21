import { MinusOutlined, UpOutlined } from "@ant-design/icons";
import { Modal, type ModalProps } from "antd";
import classNames from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { sleep } from "@/infra";

import styles from "./index.module.scss";

const minimizedHeights = new Map<symbol, number>();
const updateReservedSpace = () =>
  document.documentElement.style.setProperty(
    "--duel-minimized-height",
    `${Math.max(0, ...minimizedHeights.values())}px`,
  );

interface NeosModalProps extends ModalProps {
  minimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  minimizedActions?: ReactNode;
}
export const NeosModal: React.FC<NeosModalProps> = ({
  minimized,
  onMinimizedChange,
  minimizedActions,
  ...props
}) => {
  const [mini, setMini] = useState(false);
  const collapsed = minimized ?? mini;
  const identity = useRef(Symbol("minimized-modal"));
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const changeMinimized = (value: boolean) => {
    setMini(value);
    onMinimizedChange?.(value);
  };

  // 为了修antd的bug，先让isOpen发生变化，同时设置visibility为`hidden`，再让它变回来
  const [realOpen, setRealOpen] = useState(true);
  const [hidden, setHidden] = useState(true);

  const close = async () => {
    setRealOpen(false);
    await sleep(1000);
    setHidden(false);
  };

  useEffect(() => {
    close();
  }, []);
  useEffect(() => {
    setRealOpen(!!props.open);
    if (props.open) setMini(false);
  }, [props.open]);
  useEffect(() => {
    const id = identity.current;
    if (!collapsed || !realOpen || !content) return;
    const measure = () => {
      minimizedHeights.set(
        id,
        Math.ceil(content.getBoundingClientRect().height) + 4,
      );
      updateReservedSpace();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    measure();
    return () => {
      observer.disconnect();
      minimizedHeights.delete(id);
      updateReservedSpace();
    };
  }, [collapsed, realOpen, content]);

  return (
    <Modal
      className={classNames(styles.modal, {
        [styles["mini"]]: collapsed,
        [styles["hidden"]]: hidden,
      })}
      centered
      maskClosable={true}
      onCancel={() => changeMinimized(!collapsed)}
      closeIcon={collapsed ? <UpOutlined /> : <MinusOutlined />}
      style={{ padding: "10px 0" }}
      mask={!collapsed}
      wrapClassName={classNames({ [styles.wrap]: collapsed })}
      closable={true}
      {...props}
      modalRender={(node) => (
        <div ref={setContent}>
          {props.modalRender ? props.modalRender(node) : node}
        </div>
      )}
      title={
        collapsed ? (
          <div className={styles.miniTitle}>
            <span className={styles.titleText}>{props.title}</span>
            {minimizedActions}
          </div>
        ) : (
          props.title
        )
      }
      open={realOpen}
    />
  );
};
