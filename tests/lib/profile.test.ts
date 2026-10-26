import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { getProfileValues } from "@/lib/profile";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));

beforeEach(() => sb.reset());

describe("getProfileValues", () => {
  it("maps the saved row to form values", async () => {
    sb.onTable("profiles", {
      data: {
        full_name: "מלכה כהן",
        phone: "050-123-4567",
        vehicle_model: "יונדאי",
        vehicle_color: "לבן",
        vehicle_seats: 3,
      },
    });

    expect(await getProfileValues("u1", "שם מגוגל")).toEqual({
      fullName: "מלכה כהן",
      phone: "050-123-4567",
      hasVehicle: true,
      vehicleModel: "יונדאי",
      vehicleColor: "לבן",
      vehicleSeats: "3",
    });
    expect(sb.callsOn("profiles")).toContainEqual(["eq", ["id", "u1"]]);
  });

  it("falls back to empty fields and the Google name when there's no row", async () => {
    expect(await getProfileValues("u1", "שם מגוגל")).toEqual({
      fullName: "שם מגוגל",
      phone: "",
      hasVehicle: false,
      vehicleModel: "",
      vehicleColor: "",
      vehicleSeats: "4",
    });
  });
});
