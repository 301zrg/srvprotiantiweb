import { redirect } from "react-router-dom";

import { getUIContainer, hasUIContainer } from "@/container/compat";

/** Reload cannot restore a live socket; return to an actionable join form. */
export function requireSession() {
  if (!hasUIContainer() || getUIContainer().conn.cancelled)
    return redirect("/match");
}
