import classnames from "classnames";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { useConfig } from "@/config";
import { isMe, placeStore } from "@/stores";
import { useI18N } from "@/ui/I18N";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

export interface ChainMarker {
  index: number;
  controller?: number;
  zone?: ygopro.CardZone;
  sequence?: number;
}

export interface ChainProps {
  chains: readonly ChainMarker[];
  nBelow?: number; // 浮在该区域最上方一张卡的上面，需要感知有多少卡
  op?: boolean;
}

const lastChain = (chains: readonly ChainMarker[]) =>
  chains.reduce<ChainMarker | undefined>((last, chain) => {
    if (!last) return chain;

    return chain.index > last.index ? chain : last;
  }, undefined);

/* 这里有个妥协的实现：墓地，除外区，额外卡组的连锁图标会被卡片遮挡，原因不明,
 * 因此这里暂时采取移动一个身位的方式进行解决。最好的解决方案应该是UI上连锁图标和
 * 场地解耦。 */
export const BgChain: React.FC<ChainProps> = ({ chains, nBelow = 1, op }) => {
  const chain = lastChain(chains);

  return (
    <div
      className={classnames(styles.container, {
        [styles.op]: op,
      })}
      style={{
        // @ts-ignore
        "--n": nBelow,
      }}
    >
      {/* 暂时只适配最后的连锁，不然肯定会出现错位 */}
      {chain && (
        <div
          className={styles.chain}
          data-testid="duel-chain-marker"
          data-chain-index={chain.index}
          data-chain-controller={chain.controller}
          data-chain-zone={
            chain.zone === undefined ? undefined : ygopro.CardZone[chain.zone]
          }
          data-chain-zone-value={chain.zone}
          data-chain-sequence={chain.sequence}
          key={chain.index}
        >
          <img src={`${assetsPath}/chain.png`} />
          <div className={styles.text}>{chain.index}</div>
        </div>
      )}
    </div>
  );
};

const chainWords: Record<string, string> = {
  cn: "连锁",
  en: "Chain",
  ja: "チェーン",
  ko: "체인",
};

/** Names the pending chain link(s) started from this exact location, so
 * same-name cards in a pile or selection can be told apart. */
export const ChainTag: React.FC<{
  location?: Pick<
    ygopro.CardLocation,
    "controller" | "zone" | "sequence" | "is_overlay"
  >;
  className?: string;
}> = ({ location, className }) => {
  const { inner } = useSnapshot(placeStore);
  const { language } = useI18N();
  if (!location || location.is_overlay) return null;
  const indexes =
    inner[location.zone]?.[isMe(location.controller) ? "me" : "op"]?.[
      location.sequence
    ]?.chainIndex ?? [];
  if (!indexes.length) return null;
  return (
    <span
      className={classnames(styles.tag, className)}
      data-testid="duel-card-chain-tag"
      data-chain-index={indexes.join(" ")}
    >
      {chainWords[language] ?? chainWords.en} {indexes.join(", ")}
    </span>
  );
};
