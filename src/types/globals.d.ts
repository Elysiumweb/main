export {};

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
    paypal?: {
      HostedButtons?: (options: { hostedButtonId: string }) => { render: (selector: string) => Promise<void> | void };
    };
    grecaptcha?: {
      ready?: (callback: () => void) => void;
      execute?: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}
