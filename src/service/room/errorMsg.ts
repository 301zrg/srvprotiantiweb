import i18next from "i18next";

import { fetchCard, fetchStrings, Region, ygopro } from "@/api";
import ErrorType = ygopro.StocErrorMsg.ErrorType;
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { getLanguage } from "@/variant";
import { connectionStore } from "@/variant/connection";

// TODO: 是时候需要一个统一管理国际化文案的模块了

const DECKERROR_LFLIST = 0x1;
const DECKERROR_OCGONLY = 0x2;
const DECKERROR_TCGONLY = 0x3;
const DECKERROR_UNKNOWNCARD = 0x4;
const DECKERROR_CARDCOUNT = 0x5;
const DECKERROR_MAINCOUNT = 0x6;
const DECKERROR_EXTRACOUNT = 0x7;
const DECKERROR_SIDECOUNT = 0x8;
const DECKERROR_NOTAVAIL = 0x9;

export default async function handleErrorMsg(
  container: Container,
  errorMsg: ygopro.StocErrorMsg,
) {
  const { error_type, error_code } = errorMsg;
  playEffect(AudioActionType.SOUND_INFO);

  const roomStore = container.context.roomStore;

  const t = (key: string, card?: string) =>
    i18next.t(`ClientUI:${key}`, { lng: getLanguage(), card });

  switch (error_type) {
    case ErrorType.JOINERROR: {
      const reason =
        connectionStore.pendingJoinMessage ||
        fetchStrings(Region.System, 1403 + error_code);
      roomStore.errorMsg = reason;
      connectionStore.detail = reason;
      break;
    }
    case ErrorType.DECKERROR: {
      const flag = error_code >> 28;
      const code = error_code & 0xfffffff;
      const card = fetchCard(code);
      const baseMsg = t("InvalidDeck", card.text.name ?? String(code));
      switch (flag) {
        case DECKERROR_LFLIST: {
          roomStore.errorMsg = baseMsg + t("DeckBanlist");
          break;
        }
        case DECKERROR_OCGONLY: {
          roomStore.errorMsg = baseMsg + t("DeckOcgOnly");
          break;
        }
        case DECKERROR_TCGONLY: {
          roomStore.errorMsg = baseMsg + t("DeckTcgOnly");
          break;
        }
        case DECKERROR_UNKNOWNCARD: {
          if (code < 100000000) {
            roomStore.errorMsg = baseMsg + t("DeckUnknown");
          } else {
            roomStore.errorMsg = baseMsg + t("DeckPreRelease");
          }
          break;
        }
        case DECKERROR_CARDCOUNT: {
          roomStore.errorMsg = baseMsg + t("DeckCopies");
          break;
        }
        case DECKERROR_MAINCOUNT: {
          roomStore.errorMsg = t("MainCount");
          break;
        }
        case DECKERROR_EXTRACOUNT: {
          roomStore.errorMsg = t("ExtraCount");
          break;
        }
        case DECKERROR_SIDECOUNT: {
          roomStore.errorMsg = t("SideCount");
          break;
        }
        case DECKERROR_NOTAVAIL: {
          roomStore.errorMsg = t(
            "CardUnavailable",
            card.text.name ?? String(code),
          );
          break;
        }
        default: {
          roomStore.errorMsg = fetchStrings(Region.System, 1406);
          break;
        }
      }
      break;
    }
    case ErrorType.SIDEERROR: {
      roomStore.errorMsg = t("SideError");
      break;
    }
    case ErrorType.VERSIONERROR: {
      roomStore.errorMsg = t("VersionError");
      break;
    }
    default:
      break;
  }
}
