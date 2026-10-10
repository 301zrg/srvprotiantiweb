import { type Language } from "./index";

const messages = {
  cn: {
    settings: "操作",
    confirmSetting: "操作前确认",
    help: "召唤、盖放、发动、攻击和切换阶段前再次确认。默认关闭；取消不会提交操作。确认期间对局计时仍会继续。",
    title: "确认操作",
    cancel: "取消",
    confirm: "确认",
    reset: "清空重选",
    sortReset: "恢复原顺序",
    diagnostics: "查看连接诊断",
    diagnosticsHelp:
      "仅在本机保留最近 30 次操作的等待时间，可复制给管理员。包含网络消息到达与网页队列等待，不含昵称、密码或卡组。下一条消息未必是操作回执，这些数值不等于网络 RTT。",
  },
  en: {
    settings: "Actions",
    confirmSetting: "Confirm actions before sending",
    help: "Confirm summons, sets, activations, attacks and phase changes. Off by default. Cancelling sends no action. The duel timer continues during confirmation.",
    title: "Confirm action",
    cancel: "Cancel",
    confirm: "Confirm",
    reset: "Reset selection",
    sortReset: "Restore original order",
    diagnostics: "View connection diagnostics",
    diagnosticsHelp:
      "The last 30 action timings stay on this device and can be copied for support. Includes message arrival and browser queue waits, without names, passwords or decks. The next message may not acknowledge your action; these values are not network RTT.",
  },
  ja: {
    settings: "操作",
    confirmSetting: "操作を送信する前に確認",
    help: "召喚・セット・発動・攻撃・フェイズ変更の前に確認します。初期設定はオフです。キャンセルすると送信しません。確認中も対戦の制限時間は進みます。",
    title: "操作の確認",
    cancel: "キャンセル",
    confirm: "確認",
    reset: "選択をリセット",
    sortReset: "元の順番に戻す",
    diagnostics: "接続診断を表示",
    diagnosticsHelp:
      "直近30回の操作の待ち時間を端末内に保存し、管理者へコピーできます。メッセージ到着とブラウザー内の待ち時間のみで、名前・パスワード・デッキは含みません。次のメッセージは操作の応答とは限らず、ネットワークRTTとは異なります。",
  },
  ko: {
    settings: "조작",
    confirmSetting: "조작 전 확인",
    help: "소환, 세트, 발동, 공격 및 페이즈 변경 전에 확인합니다. 기본값은 꺼짐입니다. 취소하면 전송하지 않습니다. 확인 중에도 제한 시간은 계속 흐릅니다.",
    title: "조작 확인",
    cancel: "취소",
    confirm: "확인",
    reset: "선택 초기화",
    sortReset: "원래 순서로 복원",
    diagnostics: "연결 진단 보기",
    diagnosticsHelp:
      "최근 30회 조작의 대기 시간만 기기에 보관하며 관리자에게 복사할 수 있습니다. 메시지 도착과 브라우저 대기 시간을 포함하지만 이름, 비밀번호, 덱은 포함하지 않습니다. 다음 메시지가 조작 응답인 것은 아니므로 네트워크 RTT와 다릅니다.",
  },
} as const;

export const duelInteractionMessages = (language: string) =>
  messages[language as Language] ?? messages.en;
