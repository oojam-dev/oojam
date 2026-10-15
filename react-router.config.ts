import type { Config } from "@react-router/dev/config";

export default {
  // Server-side rendering: loaders and actions run on the server.
  ssr: true,
  // TLS ends at the edge proxy, so the app sees requests as http://oojam.dev while
  // browsers send `Origin: https://oojam.dev`. React Router's CSRF check compares the
  // two and would reject every form post; these hosts are trusted explicitly.
  allowedActionOrigins: ["oojam.dev", "www.oojam.dev"],
  // Opt in to React Router v8 behaviour now so upgrading later is a no-op.
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
