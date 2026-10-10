import {
  fetchStrings,
  getStrings,
  Region,
  sendSelectOptionResponse,
  type ygopro,
} from "@/api";
import { Container } from "@/container";
import { displayOptionModal } from "@/ui/Duel/Message";
import { duelResultSource } from "@/variant/duelResults";

export default async (
  container: Container,
  selectOption: ygopro.StocGameMessage.MsgSelectOption,
) => {
  const conn = container.conn;
  const options = selectOption.options;
  const record = (response: number) => {
    const option = options.find((option) => option.response === response);
    if (!option) return;
    const result = { kind: "option", value: option.code } as const;
    container.context.historyStore.putResult(
      container.context,
      result,
      selectOption.player,
      duelResultSource(result),
      "response",
    );
  };
  if (options.length === 0) {
    sendSelectOptionResponse(conn, 0);
    return;
  }

  if (options.length === 1) {
    sendSelectOptionResponse(conn, options[0].response);
    record(options[0].response);
    return;
  }

  const response = await displayOptionModal(
    fetchStrings(Region.System, 556),
    options.map(({ code, response }) => ({
      info: getStrings(code),
      response,
    })),
    1,
  );
  record(response);
};
