// All five demo terminals have independent in-memory state. A full reload restores
// scenario.seed, clears editors/approvals and prevents stale responses repainting it.
export function watchDemoReset(onReset: () => void, baseUrl = "http://localhost:5606") {
  let revision: string | undefined;
  let stopped = false;
  let loading = false;
  let request: AbortController | undefined;
  async function check() {
    if (stopped || loading) return;
    loading = true;
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 5000);
    try {
      const response = await fetch(`${baseUrl}/api/demo/revision`, { cache: "no-store", signal: request.signal });
      if (!response.ok) return;
      const payload = await response.json();
      const next = payload?.data?.revision;
      if (stopped || typeof next !== "string" || !next) return;
      if (revision !== undefined && revision !== next) {
        stop();
        onReset();
      }
      revision = next;
    } catch { /* Offline is not a reset. Keep local state and retry after recovery. */ }
    finally { clearTimeout(timeout); loading = false; }
  }
  const timer = setInterval(() => void check(), 2000);
  const resume = () => { void check(); };
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", resume);
  function stop() {
    stopped = true;
    clearInterval(timer);
    request?.abort();
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    document.removeEventListener("visibilitychange", resume);
  }
  void check();
  return stop;
}
