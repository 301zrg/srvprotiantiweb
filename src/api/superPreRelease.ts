// This 1103 client deliberately has no pre-release environment.
export async function initSuperPrerelease() {
  return;
}

export function isSuperReleaseCard(_code: number): boolean {
  return false;
}
