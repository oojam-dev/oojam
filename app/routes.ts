import { type RouteConfig, index, route } from "@react-router/dev/routes";

// Every page and endpoint is registered here explicitly. Add new ones with
//   route("guestbook", "routes/guestbook.tsx"),
// and link to them from the home page so visitors can find them.
export default [
  index("routes/home.tsx"),
  // Health check for the deployer and CI. Keep it.
  route("_health", "routes/_health.ts"),
] satisfies RouteConfig;
