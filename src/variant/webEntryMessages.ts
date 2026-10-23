const messages = {
  cn: {
    receiving: "正在接收网页入口信息…",
    invalid: "入口参数无效，请返回原网页重新打开。",
    unavailable: "无法接收账号信息，请返回原网页重新打开，或手动填写联机信息。",
    spectatorCache:
      "账号信息（含密码）会保留在此浏览器中；本次观战房间号不保存。",
  },
  en: {
    receiving: "Receiving web entry information…",
    invalid:
      "Invalid entry parameters. Return to the original page and open it again.",
    unavailable:
      "Unable to receive account information. Reopen from the original page, or enter your connection details manually.",
    spectatorCache:
      "Account information, including the password, is kept in this browser. The room name for this spectating session is not saved.",
  },
  ja: {
    receiving: "Web からの接続情報を受信しています…",
    invalid:
      "接続パラメーターが無効です。元のページに戻って開き直してください。",
    unavailable:
      "アカウント情報を受信できません。元のページから開き直すか、接続情報を手動で入力してください。",
    spectatorCache:
      "パスワードを含むアカウント情報はこのブラウザーに保存されます。今回の観戦ルーム名は保存されません。",
  },
  ko: {
    receiving: "웹 접속 정보를 받는 중…",
    invalid:
      "접속 매개변수가 올바르지 않습니다. 원래 페이지로 돌아가 다시 열어 주세요.",
    unavailable:
      "계정 정보를 받을 수 없습니다. 원래 페이지에서 다시 열거나 접속 정보를 직접 입력해 주세요.",
    spectatorCache:
      "비밀번호를 포함한 계정 정보는 이 브라우저에 보관됩니다. 이번 관전의 방 이름은 저장되지 않습니다.",
  },
};

export function webEntryMessages(language: string) {
  return messages[language as keyof typeof messages] ?? messages.en;
}
