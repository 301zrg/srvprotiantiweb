import { getUIContainer, initUIContainer } from "@/container/compat";
import { WebSocketStream } from "@/infra";
import { initSocket } from "@/middleware/socket";
import { pollSocketLooper } from "@/service/executor";
import { initStore } from "@/stores";
import { requestSpectatorSeat } from "@/variant/spectatorSession";

let activeConnection: WebSocketStream | undefined;

export const disconnectSrvpro = () => {
  activeConnection?.close();
  activeConnection = undefined;
};

export const finishSrvproReplays = async () => {
  const conn = activeConnection;
  await conn?.replayCapture.finish();
  if (activeConnection === conn) disconnectSrvpro();
};

// 连接SRVPRO服务
export const connectSrvpro = async (params: {
  ip: string;
  player: string;
  passWd: string;
  spectate?: boolean;
  customOnConnected?: (conn: WebSocketStream) => void;
}) => {
  // 初始化sqlite
  if (
    initStore.sqlite.progress !== 1 ||
    !initStore.i18n ||
    !initStore.forbidden
  ) {
    throw new Error("Game resources have not finished loading");
  }

  disconnectSrvpro();
  const conn = initSocket(params);
  if (params.spectate) requestSpectatorSeat(conn);
  activeConnection = conn;
  initUIContainer(conn);
  void pollSocketLooper(getUIContainer(), () => activeConnection === conn);
};
