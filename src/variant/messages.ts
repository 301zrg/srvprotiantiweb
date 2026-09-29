import { type Language } from "./index";

const messages = {
  cn: {
    home: "首页",
    connect: "联机",
    decks: "卡组",
    settings: "设置",
    retry: "重试",
    loadFailed: "环境资源加载失败",
    title: "YGOPRO 1103 网页版",
    subtitle: "2011 年 3 月禁限卡表 · 四语言卡池 · 天梯与普通房间",
    start: "进入联机",
    edit: "编辑卡组",
    nickname: "玩家昵称",
    room: "房间名",
    nicknameHint:
      "天梯已有账户可按原版输入 昵称$密码；当前标签页会保留输入，刷新后需重新填写。",
    roomHint:
      "输入 TT 进入天梯匹配；其他房间名按原版 YGOPro 联机规则进入普通房间。",
    join: "连接",
    missingWss: "站点尚未配置对战 WSS 地址。",
    invalidWss: "站点的对战 WSS 地址无效。",
    requireWss: "对战地址必须使用 WSS。",
    invalidNick: "昵称须为 1–19 个 UTF-16 字符，不能含换行。",
    invalidRoom: "房间名须为 1–19 个 UTF-16 字符，不能含换行。",
    back: "返回联机页",
    connectionFailed: "WSS 连接失败，请检查网络或联系站点管理员。",
    connectionClosed: "对战连接已断开，请返回联机页重新入场。",
    packetFailed: "对战消息处理失败",
  },
  en: {
    home: "Home",
    connect: "Online",
    decks: "Decks",
    settings: "Settings",
    retry: "Retry",
    loadFailed: "Failed to load game resources",
    title: "YGOPRO 1103 Web",
    subtitle:
      "March 2011 banlist · Four card languages · Ladder and private rooms",
    start: "Play online",
    edit: "Edit decks",
    nickname: "Nickname",
    room: "Room name",
    nicknameHint:
      "For an existing ladder account, use nickname$password as in YGOPro. This tab keeps the entry until you reload it.",
    roomHint:
      "Enter TT for ladder matchmaking. Other names use normal YGOPro rooms.",
    join: "Connect",
    missingWss: "The site has no duel WSS endpoint configured.",
    invalidWss: "The duel WSS URL is invalid.",
    requireWss: "The duel endpoint must use WSS.",
    invalidNick:
      "Nickname must contain 1–19 UTF-16 characters and no line breaks.",
    invalidRoom:
      "Room name must contain 1–19 UTF-16 characters and no line breaks.",
    back: "Back to online",
    connectionFailed:
      "WSS connection failed. Check your network or contact the site operator.",
    connectionClosed:
      "Duel connection closed. Return to the online page to join again.",
    packetFailed: "Failed to process duel message",
  },
  ja: {
    home: "ホーム",
    connect: "オンライン",
    decks: "デッキ",
    settings: "設定",
    retry: "再試行",
    loadFailed: "ゲームデータの読み込みに失敗しました",
    title: "YGOPRO 1103 Web",
    subtitle:
      "2011年3月の禁止・制限カード · 4言語のカード · ランク戦と通常ルーム",
    start: "オンライン対戦",
    edit: "デッキ編集",
    nickname: "プレイヤー名",
    room: "ルーム名",
    nicknameHint:
      "既存のランク戦アカウントは YGOPro と同様に 名前$パスワード を入力します。このタブでは再読み込みまで入力内容を保持します。",
    roomHint:
      "TT でランク戦に参加します。それ以外は通常の YGOPro ルームに入ります。",
    join: "接続",
    missingWss: "対戦用 WSS の設定がありません。",
    invalidWss: "対戦用 WSS の URL が無効です。",
    requireWss: "対戦接続には WSS が必要です。",
    invalidNick: "名前は改行なしの 1～19 UTF-16 文字にしてください。",
    invalidRoom: "ルーム名は改行なしの 1～19 UTF-16 文字にしてください。",
    back: "接続画面へ",
    connectionFailed: "WSS 接続に失敗しました。通信状態を確認してください。",
    connectionClosed: "対戦接続が切れました。接続画面から入り直してください。",
    packetFailed: "対戦メッセージの処理に失敗しました",
  },
  ko: {
    home: "홈",
    connect: "온라인",
    decks: "덱",
    settings: "설정",
    retry: "다시 시도",
    loadFailed: "게임 리소스를 불러오지 못했습니다",
    title: "YGOPRO 1103 웹",
    subtitle: "2011년 3월 금지·제한 카드 · 4개 언어 카드 · 래더와 일반 방",
    start: "온라인 대전",
    edit: "덱 편집",
    nickname: "플레이어 이름",
    room: "방 이름",
    nicknameHint:
      "기존 래더 계정은 YGOPro처럼 이름$비밀번호를 입력하세요. 이 탭에서는 새로고침 전까지 입력 내용이 유지됩니다.",
    roomHint:
      "TT를 입력하면 래더 매칭에 참여합니다. 다른 이름은 일반 YGOPro 방으로 연결됩니다.",
    join: "연결",
    missingWss: "대전용 WSS 주소가 설정되지 않았습니다.",
    invalidWss: "대전용 WSS 주소가 올바르지 않습니다.",
    requireWss: "대전 연결에는 WSS가 필요합니다.",
    invalidNick: "이름은 줄바꿈 없이 UTF-16 기준 1~19자여야 합니다.",
    invalidRoom: "방 이름은 줄바꿈 없이 UTF-16 기준 1~19자여야 합니다.",
    back: "온라인 화면으로",
    connectionFailed: "WSS 연결에 실패했습니다. 네트워크를 확인해 주세요.",
    connectionClosed:
      "대전 연결이 끊겼습니다. 온라인 화면에서 다시 입장해 주세요.",
    packetFailed: "대전 메시지 처리에 실패했습니다",
  },
};

export const siteMessages = (language: string) =>
  messages[language as Language] ?? messages.en;
