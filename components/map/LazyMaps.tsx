"use client";

import dynamic from "next/dynamic";

// Leaflet needs `window`, so the maps only load in the browser.
const loading = () => <div className="large-map" aria-busy="true" />;

export const LazyRouteMap = dynamic(() => import("./RouteMap"), { ssr: false, loading });
export const LazyRouteEditorMap = dynamic(() => import("./RouteEditorMap"), { ssr: false, loading });
