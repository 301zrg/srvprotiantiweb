import i18next from "i18next";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { fetchCard } from "@/api/cards";
import { sendChat } from "@/api/ocgcore/ocgHelper";
import { activateStrings, loadStrings } from "@/api/strings";
import { getUIContainer } from "@/container/compat";
import { activateCardDatabase, prepareCardDatabase } from "@/middleware/sqlite";
import { cardStore } from "@/stores/cardStore";
import { matStore } from "@/stores/matStore";
import { roomStore } from "@/stores/roomStore";
import {
  getEnvironmentFile,
  getLanguage,
  type Language,
  languageLocales,
  languages,
  serverLanguageCommand,
  setLanguagePreference,
} from "@/variant";
import { formatDuelHint } from "@/variant/duelHintText";

interface I18NContextType {
  language: string;
  changeLanguage: (newLanguage: string) => Promise<void>;
}

const I18NContext = createContext<I18NContextType | undefined>(undefined);

export const I18NProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguage] = useState<string>(() => {
    return getLanguage();
  });
  const latestRequest = useRef(0);

  const changeLanguage = async (newLanguage: string) => {
    if (newLanguage === language) return;
    if (!languages.includes(newLanguage as Language))
      throw new Error("Unsupported language");
    const request = ++latestRequest.current;
    const selected = newLanguage as Language;
    const results = await Promise.allSettled([
      prepareCardDatabase(getEnvironmentFile("cards.cdb", selected)),
      loadStrings(selected),
    ] as const);
    if (results[0].status === "rejected" || results[1].status === "rejected") {
      if (results[0].status === "fulfilled") results[0].value.close();
      const failed = results.find((result) => result.status === "rejected");
      throw failed?.status === "rejected"
        ? failed.reason
        : new Error("Language resources unavailable");
    }
    if (request !== latestRequest.current) {
      results[0].value.close();
      return;
    }
    activateCardDatabase(results[0].value);
    activateStrings(results[1].value);
    for (const card of cardStore.inner) {
      if (card.code > 0)
        card.meta = { ...card.meta, text: fetchCard(card.code).text };
    }
    if (matStore.hint.esHint && matStore.hint.esHintSource)
      matStore.hint.esHint = formatDuelHint(
        matStore.hint.esHintSource,
        selected,
      );
    setLanguagePreference(selected);
    await i18next.changeLanguage(selected);
    setLanguage(selected);
    if (roomStore.joined) {
      const conn = getUIContainer().conn;
      if (conn.ws.readyState === WebSocket.OPEN)
        sendChat(conn, serverLanguageCommand(selected));
    }
  };

  useEffect(() => {
    setLanguagePreference(language as Language);
    document.documentElement.lang = languageLocales[language as Language];
  }, [language]);

  return (
    <I18NContext.Provider value={{ language, changeLanguage }}>
      {children}
    </I18NContext.Provider>
  );
};

export const useI18N = (): I18NContextType => {
  const context = useContext(I18NContext);
  if (!context) {
    throw new Error("useI18N must be used within a I18NProvider");
  }
  return context;
};
