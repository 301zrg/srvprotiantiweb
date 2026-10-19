import { Button } from "antd";
import { useNavigate } from "react-router-dom";

import { AudioActionType, changeScene } from "@/infra/audio";
import { useI18N } from "@/ui/I18N";
import { Background } from "@/ui/Shared";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { communityLinks } from "@/variant/links";
import { siteMessages } from "@/variant/messages";
import { localizedWebsiteUrl } from "@/variant/websiteLink";

import styles from "./index.module.scss";

export const loader = () => {
  changeScene(AudioActionType.BGM_MENU);
  return null;
};

export const Component = () => {
  const navigate = useNavigate();
  const { language } = useI18N();
  const text = siteMessages(language);
  const websiteUrl = localizedWebsiteUrl(communityLinks.website, language);
  return (
    <>
      <Background />
      <div className={styles.wrap}>
        <div className={styles.main}>
          <div className={styles.hero}>
            <h1>{text.title}</h1>
            <p>{text.subtitle}</p>
            <div className={styles.actions}>
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
              <Button size="large" onClick={() => navigate("/replays")}>
                {(
                  {
                    cn: "录像库",
                    en: "Replays",
                    ja: "リプレイ",
                    ko: "리플레이",
                  } as Record<string, string>
                )[language] || "录像库"}
              </Button>
            </div>
          </div>

          <section className={styles.notice} aria-labelledby="home-credits">
            <h2 id="home-credits">{text.creditsTitle}</h2>
            <p>
              {text.creditsIntro}
              <a
                href={communityLinks.upstream}
                target="_blank"
                rel="noopener noreferrer"
              >
                Neos (DarkNeos/neos-ts)
              </a>
              {text.creditsThanks}
            </p>
            <p>
              {clientRevisionMessages(language).sourceIntro}{" "}
              <a
                href={communityLinks.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                srvprotiantiweb
              </a>
            </p>
          </section>

          <section className={styles.notice} aria-labelledby="home-updates">
            <h2 id="home-updates">{text.updatesTitle}</h2>
            <a
              className={styles.website}
              data-testid="ladder-website"
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{text.website}</span>
              <span>{websiteUrl}</span>
            </a>
            <p data-testid="website-features">{text.websiteFeatures}</p>
            <p data-testid="website-client-advice">
              {text.websiteClientAdvice}
            </p>
            <p>{text.updatesText}</p>
            <p>{text.feedbackText}</p>
            <div className={styles.community}>
              <a
                href={communityLinks.discord}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text.discord}
              </a>
              <a
                href={communityLinks.qq}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text.qq} · 749717894
              </a>
            </div>
          </section>
          <section className={styles.notice} aria-labelledby="home-copyright">
            <h2 id="home-copyright">{text.copyrightTitle}</h2>
            <p>{text.copyrightText}</p>
          </section>
        </div>
      </div>
    </>
  );
};
