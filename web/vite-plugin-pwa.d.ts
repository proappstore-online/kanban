import 'vite-plugin-pwa';

declare module 'vite-plugin-pwa' {
  interface ManifestOptions {
    /**
     * PAS-specific manifest extension. Narrowest viewport width (in CSS
     * pixels) the app is designed to support. The platform compliance
     * check grades mobile readiness against this; recommended values
     * are 320 | 360 | 414 | 600 | 768 | 1024.
     */
    min_viewport_width?: number;
  }
}
