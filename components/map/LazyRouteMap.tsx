"use client";

import dynamic from "next/dynamic";

// Leaflet needs `window`, so the map only loads in the browser.
export const LazyRouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="large-map" aria-busy="true" />,
});
