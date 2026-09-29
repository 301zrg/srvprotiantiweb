import { Container } from "@/container";

import handleSocketMessage from "./onSocketMessage";

export async function pollSocketLooper(
  container: Container,
  isCurrent: () => boolean = () => true,
) {
  await container.conn.execute((event) => {
    if (!isCurrent()) return Promise.resolve();
    return handleSocketMessage(container, event);
  });
}
