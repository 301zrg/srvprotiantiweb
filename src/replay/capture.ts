import { proxy } from "valtio";

import { YgoProPacketFramer } from "@/api/ocgcore/ocgAdapter/packet";
import { type HostInfo, parseHostInfo } from "@/variant/hostInfo";

import { saveReplay } from "./library";

export const replayCaptureStatus = proxy({
  state: "idle" as
    | "idle"
    | "receiving"
    | "saved"
    | "temporary"
    | "missing"
    | "error",
  saved: 0,
  detail: "",
});
export class ReplayCapture {
  private static statusOwner = "";
  private framer = new YgoProPacketFramer();
  private session = crypto.randomUUID();
  private sequence = 0;
  private seen = new Set<string>();
  private pending = 0;
  private queue = Promise.resolve();
  private endedAt = 0;
  private lastReplay = 0;
  private active = false;
  private stopped = false;
  private room: string;
  private nickname: string;
  private host?: HostInfo;
  constructor(meta?: { room: string; nickname: string }) {
    ReplayCapture.statusOwner = this.session;
    this.room = (meta?.room || "").split("$")[0].slice(0, 19);
    this.nickname = (meta?.nickname || "").split("$")[0].slice(0, 19);
  }
  private publish(status: Partial<typeof replayCaptureStatus>) {
    if (ReplayCapture.statusOwner === this.session)
      Object.assign(replayCaptureStatus, status);
  }
  receive(data: ArrayBuffer) {
    if (this.stopped) return;
    try {
      for (const packet of this.framer.push(data)) {
        if (packet.proto === 0x12 && !this.host) {
          try {
            this.host = parseHostInfo(packet.exData);
          } catch {
            /* Optional metadata only. */
          }
        }
        if (packet.proto === 0x15) {
          this.active = true;
          this.endedAt = 0;
          this.publish({
            state: "receiving",
            saved: this.seen.size,
            detail: "",
          });
        }
        if (packet.proto === 0x16) {
          this.endedAt = Date.now();
          this.publish({ state: "receiving", detail: "正在接收服务器录像…" });
        }
        if (packet.proto !== 0x17) continue;
        this.lastReplay = Date.now();
        const bytes = packet.exData.slice(),
          order = ++this.sequence,
          receivedAt = Date.now();
        if (this.pending + bytes.length > 2 * 1024 * 1024) {
          this.publish({
            state: "error",
            detail: "待保存录像超过 2 MB，未继续接收；请下载已保存的录像",
          });
          continue;
        }
        this.pending += bytes.length;
        this.queue = this.queue.then(async () => {
          try {
            const entry = await saveReplay(
              bytes,
              `${this.room || "duel"}-${new Date(receivedAt)
                .toISOString()
                .replace(/[:.]/g, "-")}.yrp`,
              {
                session: this.session,
                order,
                room: this.room,
                nickname: this.nickname,
                receivedAt,
                profile: "706-v1-candidate",
                host: this.host,
              },
            );
            if (!this.seen.has(entry.hash)) {
              this.seen.add(entry.hash);
            }
            this.publish({
              saved: this.seen.size,
              state: entry.temporary ? "temporary" : "saved",
              detail: entry.temporary
                ? "录像仅本次页面可用，请立即下载备份"
                : `已保存 ${this.seen.size} 份录像`,
            });
          } catch (error) {
            this.publish({
              state: "error",
              detail: String(error instanceof Error ? error.message : error),
            });
          } finally {
            this.pending -= bytes.length;
          }
        });
      }
    } catch (error) {
      this.publish({
        state: "error",
        detail: `录像接收失败：${String(error)}`,
      });
    }
  }
  /** Room-end UI may navigate before the independent network tail arrives. */
  async finish() {
    if (!this.active) return;
    if (this.endedAt) {
      while (
        !this.stopped &&
        Date.now() - this.endedAt < 10000 &&
        (!this.lastReplay || Date.now() - this.lastReplay < 2000)
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await this.queue;
    if (!this.seen.size && replayCaptureStatus.state !== "error") {
      this.publish({
        state: "missing",
        detail: "本次未收到服务器录像，提前退出或服务器禁止下发时无法补录",
      });
    }
  }
  stop() {
    this.stopped = true;
    if (
      this.active &&
      !this.seen.size &&
      replayCaptureStatus.state !== "error"
    ) {
      this.publish({
        state: "missing",
        detail: "已退出，本次尚未收到完整录像",
      });
    }
  }
}
