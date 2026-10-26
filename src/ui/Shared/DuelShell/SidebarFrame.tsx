import { CompressOutlined, ExpandOutlined } from "@ant-design/icons";
import { Button } from "antd";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import styles from "./sidebar.module.scss";

export interface SidebarTabContext {
  active: boolean;
  wide: boolean;
  select: (key: string) => void;
  collapse: () => void;
}

export interface SidebarTab {
  key: string;
  label: ReactNode;
  testId: string;
  /** Always called, so tabs that must stay mounted (chat) can. */
  render: (context: SidebarTabContext) => ReactNode;
}

/** Duel layout shell shared by online duels and replays. Wide (landscape)
 * screens get a docked sidebar: controls, a feedback slot and tabbed logs.
 * Narrow screens render the same controls in place (life bars on top, the
 * menu at the bottom, positioned by their own styles). Content stays
 * mounted across rotation; only its placement changes. */
export const SidebarFrame = ({
  wide,
  top,
  status,
  tabs,
  tabsLabel,
  expandLabels,
  closePanels,
  openEvents = {},
  onOpenTab,
}: {
  wide: boolean;
  /** Life bars first, then the menu; `status` sits between them. */
  top: [ReactNode, ReactNode];
  status?: ReactNode;
  tabs: SidebarTab[];
  tabsLabel: string;
  expandLabels: { expand: string; collapse: string };
  /** Closes docked panels before the log area changes size. */
  closePanels?: () => void;
  /** Window events that open a tab, e.g. `neos:open-duel-chat`. */
  openEvents?: Record<string, string>;
  onOpenTab?: (key: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(tabs[0]?.key);
  const content = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const feedbackSlot = useRef<HTMLDivElement>(null);
  const select = (tab: string) => {
    if (wide) closePanels?.();
    setActive(tab);
    if (wide && window.matchMedia("(max-height: 600px)").matches)
      setExpanded(true);
  };
  const collapse = () => {
    setActive(tabs[0]?.key);
    setExpanded(false);
  };

  useEffect(() => {
    const handlers = Object.entries(openEvents).map(([event, tab]) => {
      const handler = () => {
        select(tab);
        onOpenTab?.(tab);
      };
      window.addEventListener(event, handler);
      return () => window.removeEventListener(event, handler);
    });
    return () => handlers.forEach((remove) => remove());
  }, [wide]);

  useLayoutEffect(() => {
    if (!wide || !content.current) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--duel-sidebar-content-top",
        `${content.current?.getBoundingClientRect().top ?? 180}px`,
      );
      document.documentElement.style.setProperty(
        "--duel-feedback-top",
        `${feedbackSlot.current?.getBoundingClientRect().top ?? 0}px`,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(content.current);
    if (controls.current) observer.observe(controls.current);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty(
        "--duel-sidebar-content-top",
      );
    };
  }, [wide, expanded]);

  return (
    <aside
      className={wide ? styles.sidebar : styles.shell}
      data-testid={wide ? "duel-sidebar" : undefined}
      data-duel-sidebar={wide ? "true" : undefined}
      data-logs-expanded={expanded}
    >
      <div
        ref={controls}
        className={wide ? styles.controls : styles.shell}
        data-testid={wide ? "duel-sidebar-controls" : undefined}
      >
        {top[0]}
        {wide && status}
        {top[1]}
      </div>
      {wide && (
        <div
          ref={feedbackSlot}
          className={styles.feedbackSlot}
          data-testid="duel-feedback-slot"
        />
      )}
      {wide && (
        <nav className={styles.tabs} aria-label={tabsLabel}>
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              data-testid={tab.testId}
              type={active === tab.key ? "primary" : "text"}
              aria-pressed={active === tab.key}
              onClick={() => select(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
          <Button
            className={styles.expand}
            data-testid="duel-expand-logs"
            title={expanded ? expandLabels.collapse : expandLabels.expand}
            aria-label={expanded ? expandLabels.collapse : expandLabels.expand}
            aria-expanded={expanded}
            icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={() => {
              closePanels?.();
              setExpanded((old) => !old);
            }}
          />
        </nav>
      )}
      <div ref={content} className={wide ? styles.content : styles.shell}>
        {tabs.map((tab) => (
          <SidebarTabContent key={tab.key}>
            {tab.render({ active: active === tab.key, wide, select, collapse })}
          </SidebarTabContent>
        ))}
      </div>
    </aside>
  );
};

const SidebarTabContent = ({ children }: { children: ReactNode }) => (
  <>{children}</>
);

/** Sidebar status line style, for modes that render their own status. */
export const sidebarStatusClass = styles.status;
