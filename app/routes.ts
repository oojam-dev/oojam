import { type RouteConfig, index, route } from "@react-router/dev/routes";

// Every page and endpoint is registered here explicitly. Add new ones with
//   route("guestbook", "routes/guestbook.tsx"),
// and link to them from the home page so visitors can find them.
export default [
  index("routes/home.tsx"),
  route("wall", "routes/wall.tsx"),
  route("wall/piece/:id", "routes/wall.piece.ts"),
  route("shrine", "routes/shrine.tsx"),
  route("fishing", "routes/fishing.tsx"),
  // Managed by oojam (the guardrails require these three lines). Keep them.
  route("_health", "routes/_health.ts"),
  route("_oojam/callback", "routes/_oojam.callback.ts"),
  route("_oojam/signout", "routes/_oojam.signout.ts"),
] satisfies RouteConfig;
