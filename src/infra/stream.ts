// web平台上websocket的消息到达是保序的，但是不能保证对这些消息的逻辑处理是保序的。
// 现在我们有这样一个需求：需要保证每次只处理一个消息，在上一个消息处理完后，再进行下一个消息的处理。
//
// 因此封装了一个`WebSocketStream`类，当每次Websocket连接中有消息到达时，往流中添加event，

// 同时执行器会不断地从流中获取event进行处理。
import { getLanguage } from "@/variant";
import { connectionStore } from "@/variant/connection";
import { siteMessages } from "@/variant/messages";

const manuallyClosed = new WeakSet<WebSocketStream>();

export class WebSocketStream {
  public ws: WebSocket;
  stream: ReadableStream;

  constructor(
    ip: string,
    onWsOpen?: (conn: WebSocketStream, ev: Event) => any,
  ) {
    connectionStore.state = "connecting";
    connectionStore.detail = "";
    connectionStore.pendingJoinMessage = "";
    this.ws = new WebSocket(ip.startsWith("wss://") ? ip : `wss://${ip}`);
    const timer = window.setTimeout(() => {
      if (this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
    }, 15000);
    if (onWsOpen) {
      this.ws.onopen = (e) => {
        window.clearTimeout(timer);
        connectionStore.state = "connected";
        onWsOpen(this, e);
      };
    }
    this.ws.onerror = () => {
      if (!manuallyClosed.has(this))
        connectionStore.detail ||= siteMessages(getLanguage()).connectionFailed;
    };

    const ws = this.ws;
    const owner = this;
    this.stream = new ReadableStream({
      start(controller) {
        // 当Websocket有数据到达时，加入队列
        ws.onmessage = (event) => {
          controller.enqueue(event);
        };
        ws.onclose = (ev) => {
          window.clearTimeout(timer);
          ws.onmessage = null;
          if (!manuallyClosed.has(owner)) {
            connectionStore.state = "disconnected";
            connectionStore.detail ||= `${
              siteMessages(getLanguage()).connectionClosed
            } (${ev.code})`;
          }
          // 后续可能根据断线原因做处理，先暴露出来
          console.info("Websocket closed.", ev);
          // 下面这行注释掉，因为虽然websocket关掉了，但是已经收到的数据可能还在处理中
          controller.close();
        };
      },
      pull(_) {
        // currently not really need
      },
      cancel() {
        // currently not
      },
    });
  }

  // 异步地从Websocket中获取数据并处理
  async execute(onMessage: (event: MessageEvent) => Promise<void>) {
    const reader: ReadableStreamDefaultReader<MessageEvent> =
      this.stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await onMessage(value);
      }
    } catch (error) {
      if (!manuallyClosed.has(this))
        connectionStore.detail = `${
          siteMessages(getLanguage()).packetFailed
        }: ${error instanceof Error ? error.message : String(error)}`;
      this.ws.close();
    } finally {
      reader.releaseLock();
    }
  }

  // 关闭流
  close() {
    manuallyClosed.add(this);
    connectionStore.state = "idle";
    connectionStore.detail = "";
    this.ws.close();
  }

  isClosed(): boolean {
    return this.ws.readyState === WebSocket.CLOSED;
  }
}
