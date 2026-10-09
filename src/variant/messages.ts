import { type Language } from "./index";

const messages = {
  cn: {
    home: "首页",
    connect: "联机",
    decks: "卡组",
    replays: "录像列表",
    settings: "设置",
    retry: "重试",
    loadFailed: "环境资源加载失败",
    pageFailed: "页面未能正常打开",
    recoveryHint:
      "重试会重新获取页面和资源，不删除已保存的卡组。对局页面将返回联机页，请重新入场。",
    title: "YGOPRO 1103 网页版",
    subtitle: "2011 年 3 月禁限卡表 · 四语言卡池 · 天梯与普通房间",
    start: "进入联机",
    edit: "编辑卡组",
    creditsTitle: "开源致谢",
    creditsIntro: "本项目基于开源网页版客户端 ",
    creditsThanks: " 修改，感谢 Neos 原作者与贡献者的开发和开源分享。",
    copyrightTitle: "版权声明",
    copyrightText:
      "本网页项目为开源、非盈利的爱好者项目。游戏王相关名称、卡图等素材的版权归各自权利人所有。如相关权利人提出要求，本网页可能随时调整或下架，敬请理解。",
    updatesTitle: "天梯服与后续更新",
    website: "天梯服官网",
    updatesText: "录像播放、对战动画及 UI 优化等更多功能，将在后续逐步更新。",
    feedbackText: "遇到问题或有建议？欢迎加入 Discord 或 QQ 群反馈交流。",
    discord: "Discord 群",
    qq: "QQ 群",
    nickname: "玩家昵称",
    room: "房间名",
    copy: "复制",
    copyNickname: "复制玩家昵称",
    copyRoom: "复制房间号",
    copied: "已复制（不含密码）",
    copyFailed: "复制失败，请手动复制昵称或房间号，不要包含密码。",
    nicknameHint:
      "天梯账号按「昵称$密码」输入；未注册的昵称会自动注册，账号密码设为首次输入的密码。昵称和房间名自动保留，密码仅留在当前标签页内存。",
    roomHintBefore: "输入 TT 进入天梯匹配；其他房间名按",
    roomRules: "原版 YGOPro 联机规则",
    roomHintAfter:
      "进入普通房间。输入 M#[房间名] 进入 BO3（三局两胜）模式。非天梯匹配模式下，请将房间号发给朋友，邀请对方加入对战。",
    join: "连接",
    spectate: "进入观战",
    spectatorLinkHint: "正在通过房间链接连接，服务器确认观战身份后进入房间。",
    spectatorNicknameHint:
      "观战使用临时昵称；结束观战返回联机页后，昵称和房间名会清空。",
    spectatorManualHint:
      "此链接不会自动连接。密码房请把房间名补成「房间名$房间密码」，再点击进入观战。",
    spectatorRoomCommand:
      "观战请使用列表中的具体房间名，不能填写 TT 等房间命令。",
    spectatorNotAccepted: "服务器未确认观战身份，请确认该房间允许观战后重试。",
    invalidRoomLink:
      "房间链接参数无效；spectate 只能为 0 或 1，链接中不能包含账号或房间密码。",
    missingWss: "站点尚未配置对战 WSS 地址。",
    invalidWss: "站点的对战 WSS 地址无效。",
    requireWss: "对战地址必须使用 WSS。",
    invalidNick: "昵称须为 1–19 个 UTF-16 字符，不能含换行。",
    invalidRoom: "房间名须为 1–19 个 UTF-16 字符，不能含换行。",
    back: "返回联机页",
    connectionFailed: "WSS 连接失败，请检查网络或联系站点管理员。",
    connectionClosed: "对战连接已断开，请返回联机页重新入场。",
    connectionRecovering: "连接已中断，正在恢复原房间，请稍候…",
    connectionResumeFailed:
      "未能恢复原房间，可能已超时或对局已结束。可重试或返回联机页。",
    packetFailed: "对战消息处理失败",
  },
  en: {
    home: "Home",
    connect: "Online",
    decks: "Decks",
    replays: "Replays",
    settings: "Settings",
    retry: "Retry",
    loadFailed: "Failed to load game resources",
    pageFailed: "Unable to open this page",
    recoveryHint:
      "Retry fetches a fresh page and resources and keeps saved decks. Duel pages return to Online so you can rejoin.",
    title: "YGOPRO 1103 Web",
    subtitle:
      "March 2011 banlist · Four card languages · Ladder and private rooms",
    start: "Play online",
    edit: "Edit decks",
    creditsTitle: "Open-source credits",
    creditsIntro: "This project is adapted from the open-source web client ",
    creditsThanks:
      ". Thanks to the Neos authors and contributors for their work and for sharing it as open source.",
    copyrightTitle: "Copyright notice",
    copyrightText:
      "This is an open-source, non-profit fan project. Yu-Gi-Oh! names, card artwork and other materials belong to their respective rights holders. This website may be changed or taken offline at any time at their request. Thank you for your understanding.",
    updatesTitle: "Ladder server & upcoming updates",
    website: "Ladder website",
    updatesText:
      "Replay playback, duel animations, UI improvements, and more will be added in future updates.",
    feedbackText:
      "Found a problem or have a suggestion? Join our Discord or QQ group to share feedback.",
    discord: "Discord community",
    qq: "QQ group",
    nickname: "Nickname",
    room: "Room name",
    copy: "Copy",
    copyNickname: "Copy nickname",
    copyRoom: "Copy room name",
    copied: "Copied (without password)",
    copyFailed:
      "Could not copy. Please manually copy the nickname or room name without its password.",
    nicknameHint:
      "For ladder accounts, enter nickname$password. An unregistered nickname is registered automatically using the password you first enter. Nickname and room are remembered; passwords stay only in this tab's memory.",
    roomHintBefore:
      "Enter TT for ladder matchmaking. Other room names follow the ",
    roomRules: "original YGOPro online rules",
    roomHintAfter:
      ". Enter M#[room name] for BO3 (best-of-three) matches. Outside ladder matchmaking, send your room name to a friend to invite them to join the duel.",
    join: "Connect",
    spectate: "Spectate",
    spectatorLinkHint:
      "Connecting from a room link. Waiting for the server to confirm spectator access.",
    spectatorNicknameHint:
      "Spectator entries are temporary. Nickname and room are cleared when you return to Online.",
    spectatorManualHint:
      "This link waits for manual connection. For password rooms, enter roomName$roomPassword, then select Spectate.",
    spectatorRoomCommand:
      "Use a concrete room name from the list, not a command such as TT.",
    spectatorNotAccepted:
      "The server did not confirm spectator access. Check whether spectating is allowed and retry.",
    invalidRoomLink:
      "Invalid room link. spectate must be 0 or 1; account and room passwords cannot be included in links.",
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
    connectionRecovering:
      "Connection interrupted. Restoring the original room…",
    connectionResumeFailed:
      "Could not restore the original room. The session may have expired or ended. Retry or return to Online.",
    packetFailed: "Failed to process duel message",
  },
  ja: {
    home: "ホーム",
    connect: "オンライン",
    decks: "デッキ",
    replays: "リプレイ",
    settings: "設定",
    retry: "再試行",
    loadFailed: "ゲームデータの読み込みに失敗しました",
    pageFailed: "ページを開けませんでした",
    recoveryHint:
      "再試行でページとデータを再取得します。保存済みデッキは削除しません。対戦画面は接続画面に戻るので、再入室してください。",
    title: "YGOPRO 1103 Web",
    subtitle:
      "2011年3月の禁止・制限カード · 4言語のカード · ランク戦と通常ルーム",
    start: "オンライン対戦",
    edit: "デッキ編集",
    creditsTitle: "オープンソースへの謝辞",
    creditsIntro: "本プロジェクトはオープンソースのウェブクライアント ",
    creditsThanks:
      " を基に改修しています。Neos の作者と貢献者の皆様に、開発とソースコードの公開を感謝します。",
    copyrightTitle: "著作権について",
    copyrightText:
      "本サイトはオープンソース・非営利のファンプロジェクトです。遊戯王の名称、カード画像などの権利は各権利者に帰属します。権利者からの要請により、予告なく変更または公開を終了する場合があります。ご了承ください。",
    updatesTitle: "ランク戦サーバーと今後の更新",
    website: "ランク戦サーバー公式サイト",
    updatesText:
      "リプレイ再生、対戦アニメーション、UI の改善などは、今後の更新で順次追加予定です。",
    feedbackText:
      "不具合やご意見は、Discord または QQ グループでお知らせください。",
    discord: "Discord コミュニティ",
    qq: "QQ グループ",
    nickname: "プレイヤー名",
    room: "ルーム名",
    copy: "コピー",
    copyNickname: "プレイヤー名をコピー",
    copyRoom: "ルーム名をコピー",
    copied: "コピーしました（パスワードを除く）",
    copyFailed:
      "コピーできませんでした。パスワードを除く名前またはルーム名を手動でコピーしてください。",
    nicknameHint:
      "ランク戦は 名前$パスワード を入力します。未登録の名前は自動登録され、最初に入力したパスワードが設定されます。名前とルーム名を保存し、パスワードはこのタブのメモリだけに保持します。",
    roomHintBefore: "TT でランク戦に参加します。それ以外のルーム名は",
    roomRules: "従来の YGOPro 接続ルール",
    roomHintAfter:
      "に従って通常のルームに入ります。M#[ルーム名] を入力すると BO3（3本勝負・2本先取）モードになります。ランク戦のマッチング以外では、ルーム名を友達に送って対戦に招待してください。",
    join: "接続",
    spectate: "観戦する",
    spectatorLinkHint:
      "ルームリンクから接続中です。サーバーの観戦確認を待っています。",
    spectatorNicknameHint:
      "観戦用の入力は一時的です。接続画面へ戻ると名前とルーム名を消去します。",
    spectatorManualHint:
      "自動接続はしません。パスワード付きルームは ルーム名$パスワード を入力して「観戦する」を押してください。",
    spectatorRoomCommand:
      "一覧の具体的なルーム名を指定してください。TT などのコマンドは使用できません。",
    spectatorNotAccepted:
      "観戦が確認されませんでした。ルームの観戦設定を確認して再試行してください。",
    invalidRoomLink:
      "リンクが無効です。spectate は 0 または 1 を指定し、アカウントやルームのパスワードを含めないでください。",
    missingWss: "対戦用 WSS の設定がありません。",
    invalidWss: "対戦用 WSS の URL が無効です。",
    requireWss: "対戦接続には WSS が必要です。",
    invalidNick: "名前は改行なしの 1～19 UTF-16 文字にしてください。",
    invalidRoom: "ルーム名は改行なしの 1～19 UTF-16 文字にしてください。",
    back: "接続画面へ",
    connectionFailed: "WSS 接続に失敗しました。通信状態を確認してください。",
    connectionClosed: "対戦接続が切れました。接続画面から入り直してください。",
    connectionRecovering: "接続が切れました。元のルームに再接続しています…",
    connectionResumeFailed:
      "元のルームを復元できませんでした。時間切れまたは対戦終了の可能性があります。再試行するか接続画面へ戻ってください。",
    packetFailed: "対戦メッセージの処理に失敗しました",
  },
  ko: {
    home: "홈",
    connect: "온라인",
    decks: "덱",
    replays: "리플레이",
    settings: "설정",
    retry: "다시 시도",
    loadFailed: "게임 리소스를 불러오지 못했습니다",
    pageFailed: "페이지를 열 수 없습니다",
    recoveryHint:
      "다시 시도하면 페이지와 리소스를 새로 가져옵니다. 저장된 덱은 유지되며 대전 화면은 재입장을 위해 온라인 화면으로 돌아갑니다.",
    title: "YGOPRO 1103 웹",
    subtitle: "2011년 3월 금지·제한 카드 · 4개 언어 카드 · 래더와 일반 방",
    start: "온라인 대전",
    edit: "덱 편집",
    creditsTitle: "오픈 소스 감사 인사",
    creditsIntro: "이 프로젝트는 오픈 소스 웹 클라이언트 ",
    creditsThanks:
      "를 바탕으로 수정했습니다. 개발과 소스 공개에 힘써 주신 Neos 원작자와 기여자 여러분께 감사드립니다.",
    copyrightTitle: "저작권 안내",
    copyrightText:
      "이 웹사이트는 오픈 소스 비영리 팬 프로젝트입니다. 유희왕 명칭, 카드 이미지 등 자료의 권리는 각 권리자에게 있습니다. 권리자의 요청에 따라 언제든지 사이트를 변경하거나 운영을 중단할 수 있으니 양해 부탁드립니다.",
    updatesTitle: "래더 서버 및 향후 업데이트",
    website: "래더 서버 공식 사이트",
    updatesText:
      "리플레이 재생, 대전 애니메이션, UI 개선 등의 기능은 향후 업데이트에서 순차적으로 추가할 예정입니다.",
    feedbackText:
      "문제나 제안이 있다면 Discord 또는 QQ 그룹에 참여해 의견을 알려 주세요.",
    discord: "Discord 커뮤니티",
    qq: "QQ 그룹",
    nickname: "플레이어 이름",
    room: "방 이름",
    copy: "복사",
    copyNickname: "플레이어 이름 복사",
    copyRoom: "방 이름 복사",
    copied: "복사했습니다(비밀번호 제외)",
    copyFailed:
      "복사하지 못했습니다. 비밀번호를 제외한 이름 또는 방 이름을 직접 복사해 주세요.",
    nicknameHint:
      "래더 계정은 이름$비밀번호를 입력하세요. 미등록 이름은 자동 등록되며 처음 입력한 비밀번호가 계정 비밀번호로 설정됩니다. 이름과 방 이름은 저장하며 비밀번호는 현재 탭의 메모리에만 유지됩니다.",
    roomHintBefore: "TT를 입력하면 래더 매칭에 참여합니다. 다른 방 이름은 ",
    roomRules: "기존 YGOPro 온라인 규칙",
    roomHintAfter:
      "에 따라 일반 방으로 연결됩니다. M#[방 이름]을 입력하면 BO3(3판 2선승제) 모드로 들어갑니다. 래더 매칭이 아닌 경우 방 이름을 친구에게 보내 대전에 초대해 주세요.",
    join: "연결",
    spectate: "관전하기",
    spectatorLinkHint:
      "방 링크로 접속 중입니다. 서버의 관전 승인을 기다립니다.",
    spectatorNicknameHint:
      "관전 입력은 임시로 사용됩니다. 온라인 화면으로 돌아가면 이름과 방 이름이 지워집니다.",
    spectatorManualHint:
      "자동으로 접속하지 않습니다. 비밀번호 방은 방이름$방비밀번호를 입력한 후 관전하기를 누르세요.",
    spectatorRoomCommand:
      "목록의 실제 방 이름을 사용하세요. TT 같은 명령은 사용할 수 없습니다.",
    spectatorNotAccepted:
      "서버에서 관전이 확인되지 않았습니다. 방의 관전 허용 여부를 확인한 후 다시 시도하세요.",
    invalidRoomLink:
      "잘못된 방 링크입니다. spectate는 0 또는 1이어야 하며 계정이나 방 비밀번호를 링크에 포함할 수 없습니다.",
    missingWss: "대전용 WSS 주소가 설정되지 않았습니다.",
    invalidWss: "대전용 WSS 주소가 올바르지 않습니다.",
    requireWss: "대전 연결에는 WSS가 필요합니다.",
    invalidNick: "이름은 줄바꿈 없이 UTF-16 기준 1~19자여야 합니다.",
    invalidRoom: "방 이름은 줄바꿈 없이 UTF-16 기준 1~19자여야 합니다.",
    back: "온라인 화면으로",
    connectionFailed: "WSS 연결에 실패했습니다. 네트워크를 확인해 주세요.",
    connectionClosed:
      "대전 연결이 끊겼습니다. 온라인 화면에서 다시 입장해 주세요.",
    connectionRecovering: "연결이 끊겼습니다. 원래 방을 복구하는 중…",
    connectionResumeFailed:
      "원래 방을 복구하지 못했습니다. 시간이 초과되었거나 대전이 끝났을 수 있습니다. 재시도하거나 온라인 화면으로 돌아가세요.",
    packetFailed: "대전 메시지 처리에 실패했습니다",
  },
};

export const siteMessages = (language: string) =>
  messages[language as Language] ?? messages.en;
