import { Button } from "antd";
import { useNavigate } from "react-router-dom";

import { AudioActionType, changeScene } from "@/infra/audio";
import { useI18N } from "@/ui/I18N";
import { Background } from "@/ui/Shared";
import { siteMessages } from "@/variant/messages";

import styles from "./index.module.scss";

export const loader = () => {
  changeScene(AudioActionType.BGM_MENU);
  return null;
};

export const Component = () => {
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = siteMessages(language);
  return (
    <>
      <Background />
      <div className={styles.wrap}>
        <main
          className={styles.main}
          style={{
            flexDirection: "column",
            gap: 20,
            maxWidth: 640,
            margin: "auto",
            padding: 24,
          }}
        >
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
          <Button
            type="primary"
            size="large"
            onClick={() => navigate("/match")}
          >
            {text.start}
          </Button>
          <Button size="large" onClick={() => navigate("/build")}>
            {text.edit}
          </Button>
        </main>
      </div>
    </>
  );
};
