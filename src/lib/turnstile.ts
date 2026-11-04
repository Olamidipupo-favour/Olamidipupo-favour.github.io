export type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  getResponse: (id?: string) => string | undefined;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Loads Cloudflare Turnstile only on pages that actually render a form. */
export async function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return window.turnstile;
  if (!document.querySelector("script[data-turnstile-script]")) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Turnstile failed to load"));
      document.head.appendChild(script);
    });
  } else {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }
  return window.turnstile ?? null;
}
