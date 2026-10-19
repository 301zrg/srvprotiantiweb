import { Button, Modal } from "antd";
import React, { useState } from "react";

import { useMediaQuery } from "@/hook";
import { mobileMessages } from "@/variant/mobileMessages";
import { previewMessages } from "@/variant/previewMessages";

import { I18NSelector, useI18N } from "../I18N";
import { AnimationSetting } from "./Animation";
import { AudioSetting } from "./Audio";
import styles from "./index.module.scss";
import { MessageSetting } from "./Messages";
import { OperationSetting } from "./Operations";

export interface SettingProps {
  defaultKey?:
    | "audio"
    | "language"
    | "messages"
    | "animation"
    | "operations"
    | "other";
}

export const Setting = ({ defaultKey = "audio" }: SettingProps) => {
  const { language } = useI18N();
  const text = previewMessages(language);
  const vertical = useMediaQuery("(max-width: 600px)");
  const [active, setActive] = useState(
    defaultKey === "messages" || defaultKey === "animation"
      ? "display"
      : defaultKey === "other"
      ? "operations"
      : defaultKey,
  );
  const groups = [
    {
      key: "operations",
      label: text.operations,
      content: <OperationSetting />,
    },
    { key: "audio", label: text.sounds, content: <AudioSetting /> },
    {
      key: "display",
      label: text.displayMessages,
      content: (
        <>
          <AnimationSetting />
          <MessageSetting />
        </>
      ),
    },
    { key: "language", label: text.language, content: <I18NSelector /> },
  ];
  return (
    <div className={styles.layout}>
      {!vertical && (
        <nav
          data-testid="settings-navigation"
          className={styles.navigation}
          aria-label={mobileMessages(language).settings}
        >
          {groups.map((group) => (
            <Button
              key={group.key}
              type={active === group.key ? "primary" : "text"}
              aria-pressed={active === group.key}
              onClick={() => setActive(group.key)}
            >
              {group.label}
            </Button>
          ))}
        </nav>
      )}
      <div className={styles.groups}>
        {groups
          .filter((group) => vertical || active === group.key)
          .map((group) => (
            <section
              key={group.key}
              data-testid={`settings-section-${group.key}`}
              className={styles.section}
            >
              <h3>{group.label}</h3>
              {group.content}
            </section>
          ))}
      </div>
    </div>
  );
};

export function openSettingPanel(props: SettingProps) {
  window.dispatchEvent(
    new CustomEvent("neos:open-settings", { detail: props }),
  );
}

/** One modal inside the application providers, shared by navigation and duel. */
export const SettingPanel = () => {
  const [props, setProps] = useState<SettingProps>();
  const { language } = useI18N();
  const text = mobileMessages(language);
  React.useEffect(() => {
    const open = (event: Event) =>
      setProps((event as CustomEvent<SettingProps>).detail ?? {});
    window.addEventListener("neos:open-settings", open);
    return () => window.removeEventListener("neos:open-settings", open);
  }, []);
  const close = () => setProps(undefined);
  return (
    <Modal
      open={props !== undefined}
      centered
      title={text.settings}
      width={760}
      zIndex={1400}
      onCancel={close}
      maskClosable
      keyboard
      destroyOnClose
      className={styles.modal}
      footer={
        <Button data-testid="settings-close" onClick={close}>
          {text.close}
        </Button>
      }
    >
      {props && <Setting {...props} />}
    </Modal>
  );
};
