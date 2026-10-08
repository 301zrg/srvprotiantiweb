/** Original-file download / system sharing. No upload or format conversion. */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file),
    a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function canShareFile(file: File) {
  try {
    return (
      typeof navigator.share === "function" &&
      !!navigator.canShare?.({ files: [file] })
    );
  } catch {
    return false;
  }
}

/** Must be called directly from a user gesture with an already prepared File. */
export async function shareOrDownloadFile(file: File, title: string) {
  try {
    if (canShareFile(file)) {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      return "cancelled" as const;
  }
  downloadFile(file);
  return "downloaded" as const;
}
