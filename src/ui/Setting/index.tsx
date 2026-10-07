import {
  AudioFilled,
  PlayCircleOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import { Button, Modal, Tabs, TabsProps } from "antd";
import React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { mobileMessages } from "@/variant/mobileMessages";

import { I18NSelector, useI18N } from "../I18N";
import { AnimationSetting } from "./Animation";
import { AudioSetting } from "./Audio";

/** 设置面板属性 */
export interface SettingProps {
  /** 默认设置页 */
  defaultKey?: "audio" | "other";
}

export const Setting = (props: SettingProps) => {
  const { defaultKey = "audio" } = props;
  const { t: i18n } = useTranslation("SystemSettings");

  const items: TabsProps["items"] = [
    {
      key: "audio",
      label: (
        <>
          {i18n("AudioSettings")} <AudioFilled />
        </>
      ),
      children: <AudioSetting />,
    },
    {
      key: "language",
      label: (
        <>
          {i18n("LanguageSettings")} <TranslationOutlined />
        </>
      ),
      children: <I18NSelector />,
    },
    {
      key: "animation",
      label: (
        <>
          {i18n("AnimationSettings")} <PlayCircleOutlined />
        </>
      ),
      children: <AnimationSetting />,
    },
  ];

  return <Tabs defaultActiveKey={defaultKey} items={items} />;
};

/**
 * 打开设置面板，允许在非组件内通过此 API 打开设置面板
 */
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
    const open = (event: Event) => {
      setProps((event as CustomEvent<SettingProps>).detail ?? {});
    };
    window.addEventListener("neos:open-settings", open);
    return () => window.removeEventListener("neos:open-settings", open);
  }, []);
  const close = () => setProps(undefined);
  return (
    <Modal
      open={props !== undefined}
      centered
      title={text.settings}
      width={460}
      onCancel={close}
      maskClosable
      keyboard
      destroyOnClose
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
