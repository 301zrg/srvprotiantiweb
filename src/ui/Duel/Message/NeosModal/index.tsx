import { MinusOutlined, UpOutlined } from "@ant-design/icons";
import { Modal, type ModalProps } from "antd";
import classNames from "classnames";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { sleep } from "@/infra";

import styles from "./index.module.scss";

const minimizedHeights = new Map<symbol, number>();
const updateReservedSpace = () =>
  document.documentElement.style.setProperty(
    "--duel-minimized-height",
    `${Math.max(0, ...minimizedHeights.values())}px`,
  );

/** Title-bar dragging as in ygopro: each window keeps its own offset until the
 * viewport is resized. Moves write the transform directly, never re-render. */
function useTitleDrag(enabled: boolean) {
  const frame = useRef<HTMLDivElement | null>(null);
  const offset = useRef({ x: 0, y: 0 });
  const active = useRef(enabled);
  active.current = enabled;
  const apply = () => {
    if (frame.current)
      frame.current.style.transform =
        active.current && (offset.current.x || offset.current.y)
          ? `translate(${offset.current.x}px, ${offset.current.y}px)`
          : "";
  };
  useEffect(() => {
    // Width only: an on-screen keyboard changes the height alone.
    let width = window.innerWidth;
    const reset = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      offset.current = { x: 0, y: 0 };
      apply();
    };
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, []);
  useEffect(() => apply(), [enabled]);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = frame.current;
    if (
      !enabled ||
      !element ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      !event.target.closest(".ant-modal-header") ||
      event.target.closest("button, a, input, select, textarea")
    )
      return;
    const box = element.getBoundingClientRect();
    const header = element.querySelector(".ant-modal-header");
    const bar = (header ?? element).getBoundingClientRect();
    const origin = { ...offset.current };
    // Keep the whole window (and so its buttons) on screen when it fits;
    // otherwise keep enough title bar visible to drag it back.
    const range = (start: number, end: number, size: number, keep: number) =>
      end - start <= size
        ? [-start, size - end]
        : [keep - end, size - keep - start];
    const [minX, maxX] =
      box.width <= window.innerWidth
        ? range(box.left, box.right, window.innerWidth, 0)
        : range(
            bar.left,
            bar.right,
            window.innerWidth,
            Math.min(80, bar.width),
          );
    const [minY, maxY] =
      box.height <= window.innerHeight
        ? range(box.top, box.bottom, window.innerHeight, 0)
        : [-bar.top, window.innerHeight - bar.bottom];
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      offset.current = {
        x: origin.x + clamp(next.clientX - event.clientX, minX, maxX),
        y: origin.y + clamp(next.clientY - event.clientY, minY, maxY),
      };
      apply();
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };
  return { frame, onPointerDown };
}

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
  const drag = useTitleDrag(!collapsed);
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
        [styles.draggable]: !collapsed,
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
        <div
          ref={(element) => {
            setContent(element);
            drag.frame.current = element;
          }}
          onPointerDown={drag.onPointerDown}
        >
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
