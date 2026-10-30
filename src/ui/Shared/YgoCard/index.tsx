import classNames from "classnames";
import { CSSProperties, useMemo } from "react";

import { useConfig } from "@/config";
import { useCardImage } from "@/hook/useCardImage";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

interface Props {
  className?: string;
  isBack?: boolean;
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
    targeted = false,
    targetFlash,
    disabled = false,
    width,
    style,
    onClick,
    onLoad,
  } = props;
  const image = useCardImage(code, isBack);

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
        {/* 暂时不能这么写...但如果用onload的话来判断可能又很消耗性能，再看看吧 */}
        {/* {cardName} */}
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
      code,
      isBack,
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
