import { getUIContainer, initUIContainer } from "@/container/compat";
import { WebSocketStream } from "@/infra";
import { initSocket } from "@/middleware/socket";
import { pollSocketLooper } from "@/service/executor";
import { initStore } from "@/stores";

let activeConnection: WebSocketStream | undefined;

export const disconnectSrvpro = () => {
  activeConnection?.close();
  activeConnection = undefined;
};

// 连接SRVPRO服务
export const connectSrvpro = async (params: {
  ip: string;
  player: string;
  passWd: string;
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
  activeConnection = conn;
  initUIContainer(conn);
  void pollSocketLooper(getUIContainer(), () => activeConnection === conn);
};
