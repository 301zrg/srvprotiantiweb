import classNames from "classnames";
import { CSSProperties, useMemo } from "react";

import { fetchCard, getCardImgUrl } from "@/api/cards";
import { useConfig } from "@/config";
import { useCardImage } from "@/hook/useCardImage";
import { useI18N } from "@/ui/I18N";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

interface Props {
  className?: string;
  isBack?: boolean;
  /** Face with a translucent card back over it (replay face-down cards). */
  peek?: boolean;
  code?: number;
  targeted?: boolean;
  targetFlash?: number;
  disabled?: boolean;
  // cardName?: string;
  style?: CSSProperties;
  width?: number | string;
  onClick?: () => void;
  onLoad?: () => void;
}

export const YgoCard: React.FC<Props> = (props) => {
  const {
    className,
    code = 0,
    // cardName,
    isBack = false,
    peek = false,
    targeted = false,
    targetFlash,
    disabled = false,
    width,
    style,
    onClick,
    onLoad,
  } = props;
  const { language } = useI18N();
  const image = useCardImage(code, isBack);
  // Shown under the art until it paints (slow or failed downloads). Never for
  // backs or unknown codes, so hidden cards reveal nothing.
  const name = useMemo(
    () => (isBack || !code ? "" : fetchCard(code).text.name || ""),
    [code, isBack, language],
  );

  return useMemo(
    () => (
      <div
        className={classNames(styles["ygo-card"], className)}
        style={
          {
            width,
            "--src": image ? `url(${image})` : "none",
            ...style,
          } as any
        }
        onClick={onClick}
        // 加载完成
        onLoad={onLoad}
      >
        {/* The art is painted by ::after above this layer, so no load events
            are needed: the name shows only while the image is missing. */}
        {name && (
          <div
            className={styles.name}
            data-testid="card-fallback-name"
            aria-hidden="true"
          >
            <span>{name}</span>
          </div>
        )}
        {peek && !isBack && (
          <div
            className={styles.peekBack}
            style={{ backgroundImage: `url(${getCardImgUrl(code, true)})` }}
            data-testid="card-peek-back"
            aria-hidden="true"
          />
        )}
        {!!targetFlash && (
          <div
            key={targetFlash}
            className={styles.targetFlash}
            data-testid="card-target-flash"
            aria-hidden="true"
          />
        )}
        {targeted ? (
          <div className={styles.targeted}>
            <img src={`${assetsPath}/targeted.png`} />
          </div>
        ) : (
          <></>
        )}
        {disabled ? (
          <div className={styles.disabled}>
            <img src={`${assetsPath}/disabled.png`} />
          </div>
        ) : (
          <></>
        )}
      </div>
    ),
    [
      image,
      name,
      code,
      isBack,
      peek,
      targeted,
      targetFlash,
      disabled,
      className,
      width,
      style,
      onClick,
      onLoad,
    ],
  );
};
