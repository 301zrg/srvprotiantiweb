import { LoadingOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import styles from "./index.module.scss";

/**
 * 加载中
 * @param progress 0~1的进度
 * @param hiddenText 是否隐藏文字
 */
export const Loading: React.FC<{ progress?: number; hiddenText?: boolean }> = ({
  progress,
  hiddenText,
}) => {
  const { t } = useTranslation("ClientUI");
  return (
    <div className={styles.loading}>
      <span className={styles.icon}>
        <LoadingOutlined />
      </span>
      {!hiddenText && (
        <span className={styles.text}>
          {progress ? `${(progress * 100).toFixed(2)}%` : t("Loading")}
        </span>
      )}
    </div>
  );
};
