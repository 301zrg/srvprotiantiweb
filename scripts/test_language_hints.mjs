import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import i18next from "i18next";

const languages = ["cn", "en", "ja", "ko"];
const names = ["Chinese", "English", "Japanese", "Korean"];
const catalogs = Object.fromEntries(languages.map((lang, i) => [lang, JSON.parse(readFileSync(`src/ui/I18N/Source/${names[i]}/translation.json`, "utf8"))]));
await i18next.init({resources: Object.fromEntries(languages.map(lang => [lang, catalogs[lang]])), lng: "cn"});
const shims = {
  "@/api": `export const ygopro={StocErrorMsg:{ErrorType:{JOINERROR:1,DECKERROR:2,SIDEERROR:3,VERSIONERROR:4}}}; export const Region={System:0}; export const fetchCard=code=>({text:{name:'card-'+code}}); export const fetchStrings=(r,code)=>'system-'+code;`,
  "@/api/cards": `export const fetchCard=code=>({text:{name:'card-'+code+'-'+globalThis.__hintLanguage}});`,
  "@/api/strings": `export const Region={System:0}; export const fetchStrings=(r,code)=>'system-'+code+'-'+globalThis.__hintLanguage;`,
  "@/infra/audio": `export const AudioActionType={SOUND_INFO:1}; export const playEffect=()=>{};`,
  "@/variant": `export const getLanguage=()=>globalThis.__hintLanguage;`,
  "@/variant/connection": `export const connectionStore={pendingJoinMessage:'',detail:''};`,
};
const temp = resolve(".audit-tmp/language-unit-tests"); mkdirSync(temp, {recursive: true});
const result = await build({stdin: {contents: 'export {default as handleError} from "./src/service/room/errorMsg"; export {formatDuelHint} from "./src/variant/duelHintText"; export {localizeReplayText} from "./src/replay/localizedText";', resolveDir: process.cwd()}, bundle: true, write: false, platform: "node", format: "esm", external: ["i18next"], plugins: [{name: "isolated-ui-sources", setup(b) {
  b.onResolve({filter: /^@\//}, args => shims[args.path] ? {path: args.path, namespace: "ui-shim"} : undefined);
  b.onLoad({filter: /.*/, namespace: "ui-shim"}, args => ({contents: shims[args.path]}));
}}]});
const modulePath = resolve(temp, "messages.mjs"); writeFileSync(modulePath, result.outputFiles[0].text);
const {handleError, formatDuelHint, localizeReplayText} = await import(pathToFileURL(modulePath));
const expected = {
  cn: {main: "主卡组数量应为 40–60 张", ban: "（数量不符合禁限卡表）", side: "更换副卡组失败，请检查卡片张数是否一致。", hint: "「card-89631139-cn」攻击时", legacy: "双打录像暂仅保存与下载"},
  en: {main: "Main Deck must contain 40–60 cards", ban: " (card count violates the banlist)", side: "Side decking failed. Check that card counts are unchanged.", hint: "When “card-89631139-en” attacks", legacy: "Tag replays support saving and downloading only"},
  ja: {main: "メインデッキは40～60枚にしてください", ban: "（枚数が禁止・制限リストに違反しています）", side: "サイド交換に失敗しました。各デッキの枚数が同じか確認してください。", hint: "「card-89631139-ja」の攻撃時", legacy: "タッグのリプレイは保存とダウンロードのみ対応しています"},
  ko: {main: "메인 덱은 40–60장이어야 합니다", ban: " (금지·제한 목록에 맞지 않는 매수)", side: "사이드 덱 교체에 실패했습니다. 카드 매수가 같은지 확인하세요.", hint: "“card-89631139-ko”의 공격 시", legacy: "태그 리플레이는 저장과 다운로드만 지원합니다"},
};
for (const language of languages) {
  globalThis.__hintLanguage = language; await i18next.changeLanguage(language);
  const context = {context: {roomStore: {}}};
  await handleError(context, {error_type: 2, error_code: (6 << 28)});
  assert.equal(context.context.roomStore.errorMsg, expected[language].main);
  await handleError(context, {error_type: 2, error_code: (1 << 28) | 89631139});
  assert.ok(context.context.roomStore.errorMsg.endsWith(expected[language].ban));
  assert.ok(context.context.roomStore.errorMsg.includes("card-89631139"));
  await handleError(context, {error_type: 3, error_code: 0});
  assert.equal(context.context.roomStore.errorMsg, expected[language].side);
  assert.equal(formatDuelHint({originMsg: "「[?]」攻击时", cardID: 89631139}, language), expected[language].hint);
  assert.equal(formatDuelHint({originMsg: 1600}, language), `system-1600-${language}`);
  assert.equal(localizeReplayText("双打录像暂仅保存与下载", language), expected[language].legacy);
  assert.equal(localizeReplayText("Native technical diagnostic", language), "Native technical diagnostic");
}
// All persisted format/worker/storage reasons remain translatable without changing file metadata.
const diagnostics = JSON.parse(readFileSync("src/replay/diagnosticMessages.json", "utf8"));
for (const [reason, messages] of Object.entries(diagnostics))
  for (const language of languages) assert.equal(localizeReplayText(reason, language), messages[language]);
for (const language of ["en", "ko"])
  for (const message of ["正在加载 core.wasm", "播放资源请求失败：404", "录像版本 0x1363 尚未验证，暂仅保存与下载", "不支持 Core 消息 222"])
    assert.ok(!/[\u4e00-\u9fff]/.test(localizeReplayText(message, language)), message);
console.log("Four-language duel hints, invalid deck/side errors and all 55 replay diagnostics passed.");
