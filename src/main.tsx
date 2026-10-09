/*
 * Neos是基于[React](https://reactjs.org/)框架
 * 研发的Web版[Ygopro](https://github.com/Fluorohydride/ygopro)，游戏王对战平台。
 *
 * - 路由管理：[React Router](https://reactrouter.com/en/main)
 * - 状态管理：[valtio](https://valtio.pmnd.rs/)
 *
 * 项目整体架构分为以下模块：
 * - UI模块：基于HTML+CSS进行UI渲染；
 * - Service模块：一些具体业务逻辑的实现，通常是一些事件处理函数；
 * - MiddleWare（中间件）模块：收敛Websocket长连接的处理逻辑；
 * - Adapter模块：进行ygopro数据协议从二进制buffer到TypeScript结构体之间的转换；
 * - Api模块：提供长连接以外请求网络数据的接口，比如登录萌卡账号；
 * - Store模块：进行全局状态的管理。
 *
 * */
import "u-reset.css";
import "overlayscrollbars/overlayscrollbars.css";
import "@/styles/core.scss";
import "@/styles/inject.scss";

import {
  enUSIntl,
  jaJPIntl,
  koKRIntl,
  ProConfigProvider,
  zhCNIntl,
} from "@ant-design/pro-provider";
import { App, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import jaJP from "antd/locale/ja_JP";
import koKR from "antd/locale/ko_KR";
import zhCN from "antd/locale/zh_CN";
import React from "react";
import ReactDOM from "react-dom/client";

import { theme } from "@/ui/theme";

import { I18NProvider, useI18N } from "./ui/I18N";
import { NeosRouter } from "./ui/NeosRouter";
import { type Language } from "./variant";

const componentLocales = { cn: zhCN, en: enUS, ja: jaJP, ko: koKR };
const componentIntl = {
  cn: zhCNIntl,
  en: enUSIntl,
  ja: jaJPIntl,
  ko: koKRIntl,
};
const LocalizedApplication = () => {
  const { language } = useI18N();
  return (
    <ConfigProvider
      theme={theme}
      locale={componentLocales[language as Language]}
    >
      <App>
        <ProConfigProvider dark intl={componentIntl[language as Language]}>
          <NeosRouter />
        </ProConfigProvider>
      </App>
    </ConfigProvider>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <I18NProvider>
    <LocalizedApplication />
  </I18NProvider>,
);
