import type { Language } from "./index";

const messages = {
  cn: {
    title: "接收卡组",
    waiting: "正在等待官网发送卡组…",
    importing: "正在导入卡组…",
    failed: "未能导入卡组",
    back: "打开卡组编辑器",
    continue: "确认区块并导入",
    zone: "选择卡组区块",
    main: "主卡组",
    extra: "额外卡组",
    defaultTitle: "导入卡组",
    reused: "已打开本机已有的相同卡组",
    memory:
      "卡组仅暂存在当前页面，尚未保存到本机。请下载备份，或恢复浏览器存储后重新导入。",
    zones:
      "这些卡号不在当前卡库中，无法判断它们属于主卡组还是额外卡组。请指定区块；原卡号和重复张数都会保留。",
    errors: {
      "invalid-link":
        "卡组链接缺少必要参数或版本不受支持，请返回来源页面重新打开。",
      "too-large": "卡组内容超过接收限制，请改用文件导入。",
      "invalid-format": "卡组格式不正确或数据不完整。",
      "invalid-card": "卡组包含无效卡号。",
      "empty-deck": "没有收到任何卡片。",
      "unknown-zones": "部分卡号的区块需要确认。",
      "bridge-unavailable":
        "无法与来源页面通信，请返回官网重新打开，或下载 YDK 后导入。",
      "bridge-timeout": "等待卡组超时，请返回官网重试，或下载 YDK 后导入。",
      "source-denied": "此来源尚未允许向网页版发送卡组。",
    },
  },
  en: {
    title: "Receive deck",
    waiting: "Waiting for the website to send the deck…",
    importing: "Importing deck…",
    failed: "Could not import deck",
    back: "Open deck editor",
    continue: "Confirm zones and import",
    zone: "Choose deck zone",
    main: "Main Deck",
    extra: "Extra Deck",
    defaultTitle: "Imported deck",
    reused: "Opened an identical saved deck",
    memory:
      "This deck is only held in this page and has not been saved. Download a backup, or restore browser storage and import again.",
    zones:
      "These IDs are not in the current database. Choose Main or Extra for each ID. IDs and duplicate copies will be preserved.",
    errors: {
      "invalid-link":
        "The deck link is incomplete or uses an unsupported version. Open it again from its source.",
      "too-large":
        "The deck exceeds the import limit. Use file import instead.",
      "invalid-format": "The deck format is invalid or incomplete.",
      "invalid-card": "The deck contains an invalid card ID.",
      "empty-deck": "No cards were received.",
      "unknown-zones": "Some card zones need confirmation.",
      "bridge-unavailable":
        "Cannot contact the source page. Open it again from the website, or import a downloaded YDK.",
      "bridge-timeout":
        "Timed out waiting for the deck. Retry from the website, or import a downloaded YDK.",
      "source-denied":
        "This source is not allowed to send decks to this client.",
    },
  },
  ja: {
    title: "デッキ受信",
    waiting: "サイトからのデッキ送信を待っています…",
    importing: "デッキを読み込んでいます…",
    failed: "デッキを読み込めませんでした",
    back: "デッキ編集を開く",
    continue: "区分を確認して読込",
    zone: "デッキ区分を選択",
    main: "メインデッキ",
    extra: "エクストラデッキ",
    defaultTitle: "読込デッキ",
    reused: "保存済みの同じデッキを開きました",
    memory:
      "このデッキは現在のページに一時保持され、まだ保存されていません。バックアップをダウンロードするか、ブラウザの保存機能を復旧して再読込してください。",
    zones:
      "これらのカード番号は現在のカードデータにありません。メインかエクストラを指定してください。番号と重複枚数は保持されます。",
    errors: {
      "invalid-link":
        "デッキリンクが不完全か、未対応のバージョンです。元のページから開き直してください。",
      "too-large": "読込上限を超えています。ファイル読込をご利用ください。",
      "invalid-format": "デッキ形式が不正か、データが不完全です。",
      "invalid-card": "無効なカード番号が含まれています。",
      "empty-deck": "カードを受信していません。",
      "unknown-zones": "カードの区分を確認してください。",
      "bridge-unavailable":
        "元のページと通信できません。サイトから開き直すか、YDK を保存して読み込んでください。",
      "bridge-timeout":
        "受信がタイムアウトしました。サイトから再試行するか、YDK を読み込んでください。",
      "source-denied": "このサイトからのデッキ送信は許可されていません。",
    },
  },
  ko: {
    title: "덱 받기",
    waiting: "웹사이트에서 덱을 보내기를 기다리는 중…",
    importing: "덱을 가져오는 중…",
    failed: "덱을 가져오지 못했습니다",
    back: "덱 편집기 열기",
    continue: "영역 확인 후 가져오기",
    zone: "덱 영역 선택",
    main: "메인 덱",
    extra: "엑스트라 덱",
    defaultTitle: "가져온 덱",
    reused: "이미 저장된 동일한 덱을 열었습니다",
    memory:
      "이 덱은 현재 페이지에만 임시로 보관되며 저장되지 않았습니다. 백업을 다운로드하거나 브라우저 저장 기능을 복구한 후 다시 가져오세요.",
    zones:
      "현재 카드 데이터에 없는 번호입니다. 각 번호의 메인 또는 엑스트라 영역을 지정하세요. 번호와 중복 장수는 유지됩니다.",
    errors: {
      "invalid-link":
        "덱 링크가 불완전하거나 지원되지 않는 버전입니다. 원래 페이지에서 다시 여세요.",
      "too-large": "가져오기 제한을 초과했습니다. 파일로 가져오세요.",
      "invalid-format": "덱 형식이 잘못되었거나 데이터가 불완전합니다.",
      "invalid-card": "잘못된 카드 번호가 포함되어 있습니다.",
      "empty-deck": "카드를 받지 못했습니다.",
      "unknown-zones": "일부 카드의 영역을 확인해야 합니다.",
      "bridge-unavailable":
        "원래 페이지와 통신할 수 없습니다. 웹사이트에서 다시 열거나 다운로드한 YDK를 가져오세요.",
      "bridge-timeout":
        "덱 수신 시간이 초과되었습니다. 다시 시도하거나 YDK를 가져오세요.",
      "source-denied": "이 출처의 덱 전송은 허용되지 않았습니다.",
    },
  },
};

export const deckImportMessages = (language: string) =>
  messages[language as Language] ?? messages.en;
