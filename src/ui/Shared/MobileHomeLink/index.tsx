import { HomeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";

import { useI18N } from "@/ui/I18N";
import { siteMessages } from "@/variant/messages";

import styles from "./index.module.scss";

export const MobileHomeLink = () => {
  const { language } = useI18N();
  const label = siteMessages(language).home;
  return (
    <Link
      to="/"
      className={styles.home}
      data-testid="mobile-home"
      aria-label={label}
      title={label}
    >
      <HomeOutlined aria-hidden />
    </Link>
  );
};
