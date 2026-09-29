import initSqlJs, { Database } from "sql.js";

import { CardData, CardMeta, CardText } from "@/api/cards";
import { pfetch } from "@/infra";
import { assetsPath } from "@/variant";

import { FtsParams, invokeFts } from "./fts";

export enum sqliteCmd {
  INIT,
  SELECT,
  FTS,
}

export interface sqliteAction<T extends sqliteCmd> {
  cmd: T;
  initInfo?: {
    releaseDbUrl: string;
    preReleaseDbUrl?: string;
    progressCallback?: (progress: number) => void;
  };
  payload?: {
    id?: number;
    ftsParams?: FtsParams;
  };
}

export interface sqliteResult {
  selectResult?: CardMeta;
  ftsResult?: CardMeta[];
}

const sqlPromise = initSqlJs({ locateFile: (file) => `${assetsPath}/${file}` });
let db: Database | null = null;

export async function prepareCardDatabase(
  url: string,
  progressCallback?: (progress: number) => void,
) {
  const [SQL, buffer] = await Promise.all([
    sqlPromise,
    pfetch(url, { progressCallback }).then((response) => {
      if (!response.ok) throw new Error(`cards.cdb: HTTP ${response.status}`);
      return response.arrayBuffer();
    }),
  ]);
  const next = new SQL.Database(new Uint8Array(buffer));
  const check = next.exec("PRAGMA quick_check");
  if (check[0]?.values[0]?.[0] !== "ok") {
    next.close();
    throw new Error("Card database failed integrity check");
  }
  return next;
}

export function activateCardDatabase(next: Database) {
  const previous = db;
  db = next;
  previous?.close();
}

export default function sqliteMiddleware<T extends sqliteCmd>(
  action: sqliteAction<T>,
): T extends sqliteCmd.INIT ? Promise<void> : sqliteResult {
  return helper(action) as any;
}

function helper<T extends sqliteCmd>(action: sqliteAction<T>) {
  switch (action.cmd) {
    case sqliteCmd.INIT: {
      if (!action.initInfo) return Promise.reject(new Error("Missing CDB URL"));
      const info = action.initInfo;
      return prepareCardDatabase(info.releaseDbUrl, info.progressCallback).then(
        activateCardDatabase,
      );
    }
    case sqliteCmd.SELECT: {
      if (!db || !action.payload?.id) return {};
      const code = action.payload.id;
      const dataStmt = db.prepare("SELECT * FROM datas WHERE ID = $id");
      const textStmt = db.prepare("SELECT * FROM texts WHERE ID = $id");
      try {
        const data = dataStmt.getAsObject({ $id: code });
        const cardText = textStmt.getAsObject({ $id: code });
        return { selectResult: constructCardMeta(code, data, cardText) };
      } finally {
        dataStmt.free();
        textStmt.free();
      }
    }
    case sqliteCmd.FTS:
      return db && action.payload?.ftsParams
        ? { ftsResult: invokeFts(db, action.payload.ftsParams) }
        : {};
    default:
      return {};
  }
}

export function constructCardMeta(
  id: number,
  data: CardData,
  text: CardText,
): CardMeta {
  const level = data.level ?? 0;
  data.level = level & 0xff;
  data.lscale = (level >> 24) & 0xff;
  data.rscale = (level >> 16) & 0xff;
  return { id, data, text };
}
