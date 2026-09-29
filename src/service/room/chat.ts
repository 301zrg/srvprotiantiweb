import { ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { connectionStore } from "@/variant/connection";

export default function handleChat(
  container: Container,
  pb: ygopro.YgoStocMsg,
) {
  playEffect(AudioActionType.SOUND_CHAT);
  const context = container.context;
  const chat = pb.stoc_chat;
  context.chatStore.message = chat.msg;
  context.chatStore.sender = chat.player;
  if (!context.roomStore.joined) {
    connectionStore.pendingJoinMessage = chat.msg.replace(/\0+$/, "").trim();
  }
}
