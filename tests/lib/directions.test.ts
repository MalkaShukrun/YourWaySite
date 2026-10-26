import { describe, expect, it } from "vitest";
import { googleMapsUrl, wazeUrl } from "@/lib/directions";

describe("navigation links", () => {
  it("builds a Waze link", () => {
    expect(wazeUrl({ lat: 31.75, lng: 35.0 })).toBe("https://waze.com/ul?ll=31.75,35&navigate=yes");
  });

  it("builds a Google Maps directions link", () => {
    expect(googleMapsUrl({ lat: 31.75, lng: 35.21 })).toBe("https://www.google.com/maps/dir/?api=1&destination=31.75,35.21");
  });

  it("searches by name for a stop that isn't on the map", () => {
    expect(wazeUrl("צומת ביג")).toBe("https://waze.com/ul?q=%D7%A6%D7%95%D7%9E%D7%AA%20%D7%91%D7%99%D7%92&navigate=yes");
    expect(googleMapsUrl("צומת ביג")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=%D7%A6%D7%95%D7%9E%D7%AA%20%D7%91%D7%99%D7%92",
    );
  });
});
