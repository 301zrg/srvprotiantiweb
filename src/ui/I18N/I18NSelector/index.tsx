import { App, Select } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useI18N } from "../I18NContext";

const options = [
  { value: "cn", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];

export const I18NSelector = () => {
  const { t } = useTranslation("ClientUI");
  const { language, changeLanguage } = useI18N();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  return (
    <Select
      aria-label={t("Language")}
      value={language}
      options={options}
      loading={loading}
      disabled={loading}
      style={{ width: 112 }}
      onChange={async (selected) => {
        setLoading(true);
        try {
          await changeLanguage(selected);
        } catch (error) {
          message.error(error instanceof Error ? error.message : String(error));
        } finally {
          setLoading(false);
        }
      }}
    />
  );
};
