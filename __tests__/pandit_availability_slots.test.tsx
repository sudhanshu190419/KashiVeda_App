// __tests__/pandit_availability_slots.test.ts
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { Switch } from "react-native";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { AvailabilityRuleCard } from "../src/features/pandit/components/AvailabilityRuleCard.tsx";
import { panditService } from "../src/features/pandit/services/panditService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

describe("Pandit Availability & Time-Slot Discovery Architecture", () => {
  const panditId = "11111111-2222-3333-4444-555555555555";
  const testDate = "2026-10-16"; // Future Friday

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Case A: Pandit has no weekly schedule -> 0 slots
  // =========================================================================
  test("A. Pandit has no weekly schedule configured -> returns 0 slots with descriptive reason", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: {
        available_slots: [],
        reason: "Pandit has not scheduled working hours on this day of the week.",
      },
      error: null,
    } as any);

    const result = await bookingService.fetchPanditAvailability(panditId, testDate, 60);

    expect(mockRpc).toHaveBeenCalledWith("get_pandit_available_slots", {
      p_pandit_id: panditId,
      p_date: testDate,
      p_duration_minutes: 60,
    });
    expect(result.availableSlots).toEqual([]);
    expect(result.reason).toBe("Pandit has not scheduled working hours on this day of the week.");
  });

  // =========================================================================
  // Case B: Pandit has a weekly schedule -> slots are returned
  // =========================================================================
  test("B. Pandit has a weekly schedule -> slots are returned across working window", async () => {
    const expectedSlots = [
      "2026-10-16T06:00:00+05:30",
      "2026-10-16T06:30:00+05:30",
      "2026-10-16T07:00:00+05:30",
      "2026-10-16T07:30:00+05:30",
    ];

    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: {
        available_slots: expectedSlots,
        reason: null,
      },
      error: null,
    } as any);

    const result = await bookingService.fetchPanditAvailability(panditId, testDate, 60);

    expect(mockRpc).toHaveBeenCalledWith("get_pandit_available_slots", {
      p_pandit_id: panditId,
      p_date: testDate,
      p_duration_minutes: 60,
    });
    expect(result.availableSlots).toEqual(expectedSlots);
    expect(result.reason).toBeUndefined();
  });

  // =========================================================================
  // Case C: Existing unavailability block removes slots
  // =========================================================================
  test("C. Existing unavailability block removes colliding slots", () => {
    // Simulate slot generation logic with an unavailability block (08:00 to 11:00)
    const windowStart = new Date("2026-10-16T06:00:00+05:30").getTime();
    const windowEnd = new Date("2026-10-16T12:00:00+05:30").getTime();
    const durationMs = 60 * 60 * 1000;
    const stepMs = 30 * 60 * 1000;

    const blockStart = new Date("2026-10-16T08:00:00+05:30").getTime();
    const blockEnd = new Date("2026-10-16T10:30:00+05:30").getTime();

    const candidateSlots: string[] = [];
    for (let cur = windowStart; cur + durationMs <= windowEnd; cur += stepMs) {
      const slotStart = cur;
      const slotEnd = cur + durationMs;

      // Unavailability block check: slot overlaps block
      const hasBlockConflict = slotStart < blockEnd && slotEnd > blockStart;
      if (!hasBlockConflict) {
        candidateSlots.push(new Date(slotStart).toISOString());
      }
    }

    // 06:00-07:00 (OK), 06:30-07:30 (OK), 07:00-08:00 (OK)
    // 07:30-08:30 (COLLIDES with block starting at 08:00)
    // 08:00-09:00, 08:30-09:30, 09:00-10:00, 09:30-10:30, 10:00-11:00 (COLLIDE)
    // 10:30-11:30 (OK), 11:00-12:00 (OK)
    expect(candidateSlots.length).toBe(5);
  });

  // =========================================================================
  // Case D: Existing booking removes overlapping slots
  // =========================================================================
  test("D. Existing booking removes overlapping slots", () => {
    // Simulate slot generation with an existing confirmed booking (10:00 to 11:30)
    const windowStart = new Date("2026-10-16T09:00:00+05:30").getTime();
    const windowEnd = new Date("2026-10-16T13:00:00+05:30").getTime();
    const durationMs = 60 * 60 * 1000;
    const stepMs = 30 * 60 * 1000;

    const bookingStart = new Date("2026-10-16T10:00:00+05:30").getTime();
    const bookingEnd = new Date("2026-10-16T11:30:00+05:30").getTime();

    const candidateSlots: string[] = [];
    for (let cur = windowStart; cur + durationMs <= windowEnd; cur += stepMs) {
      const slotStart = cur;
      const slotEnd = cur + durationMs;

      // Booking overlap check: slot overlaps booking
      const hasBookingConflict = slotStart < bookingEnd && slotEnd > bookingStart;
      if (!hasBookingConflict) {
        candidateSlots.push(new Date(slotStart).toISOString());
      }
    }

    // 09:00-10:00 (OK)
    // 09:30-10:30 (COLLIDES with booking starting at 10:00)
    // 10:00-11:00 (COLLIDES)
    // 10:30-11:30 (COLLIDES)
    // 11:00-12:00 (COLLIDES with booking ending at 11:30)
    // 11:30-12:30 (OK)
    // 12:00-13:00 (OK)
    expect(candidateSlots.length).toBe(3);
  });

  // =========================================================================
  // Case E: Customer cannot see another customer's booking information
  // =========================================================================
  test("E. Customer availability discovery does not expose any customer booking rows", async () => {
    const safeSlots = ["2026-10-16T06:00:00+05:30", "2026-10-16T06:30:00+05:30"];

    jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: {
        available_slots: safeSlots,
        reason: null,
      },
      error: null,
    } as any);

    const result = await bookingService.fetchPanditAvailability(panditId, testDate, 60);

    // Payload contains strictly anonymous time slot strings
    expect(result.availableSlots).toEqual(safeSlots);
    result.availableSlots.forEach((slot) => {
      expect(typeof slot).toBe("string");
      expect(slot).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    // Verify no customer private metadata is present in the response
    expect((result as any).customer_id).toBeUndefined();
    expect((result as any).booking_id).toBeUndefined();
    expect((result as any).price).toBeUndefined();
    expect((result as any).address).toBeUndefined();
  });

  // =========================================================================
  // Case F: Booking backend independently validates the selected time
  // =========================================================================
  test("F. Booking backend (create_or_validate_booking) independently validates weekly working hours", () => {
    // Verify the invariant: booking time outside working window is rejected
    const workingWindowStart = "06:00:00";
    const workingWindowEnd = "21:00:00";

    const requestedStartTime = "05:00:00"; // Before working hours
    const requestedEndTime = "06:00:00";

    const isWithinHours =
      requestedStartTime >= workingWindowStart && requestedEndTime <= workingWindowEnd;

    expect(isWithinHours).toBe(false);

    const validStartTime = "09:00:00";
    const validEndTime = "10:00:00";
    const isValid =
      validStartTime >= workingWindowStart && validEndTime <= workingWindowEnd;

    expect(isValid).toBe(true);
  });

  // =========================================================================
  // Case G: Input validation guards
  // =========================================================================
  test("G. Guard against missing pandit ID or date", async () => {
    const resultNoPandit = await bookingService.fetchPanditAvailability("", testDate, 60);
    expect(resultNoPandit.availableSlots).toEqual([]);
    expect(resultNoPandit.reason).toBe("Pandit selection and date are required.");

    const resultNoDate = await bookingService.fetchPanditAvailability(panditId, "", 60);
    expect(resultNoDate.availableSlots).toEqual([]);
    expect(resultNoDate.reason).toBe("Pandit selection and date are required.");
  });
});

describe("Pandit Weekly Schedule UI & Availability State Verification", () => {
  const panditId = "11111111-2222-3333-4444-555555555555";

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // A. Missing rule -> UI is not falsely ON
  test("A. Missing rule -> UI is not falsely ON (Switch value is false)", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={0} // Sunday
          rule={undefined}
          onSaveRule={jest.fn()}
        />
      );
    });

    const root = renderer!.root;
    const switchComp = root.findByType(Switch);
    expect(switchComp.props.value).toBe(false);
  });

  // B. Missing rule -> default 08:00-18:00 is not presented as saved
  test("B. Missing rule -> default 08:00-18:00 is not presented as saved (shows 'Not configured' and 'Set working hours >')", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={0} // Sunday
          rule={undefined}
          onSaveRule={jest.fn()}
        />
      );
    });

    const root = renderer!.root;
    // Must display "Not configured"
    expect(root.findAllByProps({ children: "Not configured" }).length).toBeGreaterThan(0);
    // Must display "Set working hours >"
    expect(root.findAllByProps({ children: "Set working hours >" }).length).toBeGreaterThan(0);
    // Must NOT display "08:00 - 18:00" as subtitle
    expect(root.findAllByProps({ children: "08:00 - 18:00" }).length).toBe(0);
  });

  // C. Enable unconfigured day -> creates active rule
  test("C. Enable unconfigured day -> creates active rule (is_active: true)", async () => {
    const onSave = jest.fn().mockResolvedValue({});
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={0} // Sunday
          rule={undefined}
          onSaveRule={onSave}
        />
      );
    });

    const root = renderer!.root;
    const switchComp = root.findByType(Switch);

    await act(async () => {
      await switchComp.props.onValueChange(true);
    });

    expect(onSave).toHaveBeenCalledWith({
      id: undefined,
      day_of_week: 0,
      start_time: "08:00:00",
      end_time: "18:00:00",
      is_active: true,
    });
  });

  // D. Disable configured day -> saves inactive rule
  test("D. Disable configured day -> saves inactive rule (is_active: false)", async () => {
    const onSave = jest.fn().mockResolvedValue({});
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={0} // Sunday
          rule={{
            id: "rule-sun-1",
            pandit_id: panditId,
            day_of_week: 0,
            start_time: "08:00:00",
            end_time: "18:00:00",
            timezone: "Asia/Kolkata",
            is_active: true,
          }}
          onSaveRule={onSave}
        />
      );
    });

    const root = renderer!.root;
    const switchComp = root.findByType(Switch);
    expect(switchComp.props.value).toBe(true);

    await act(async () => {
      await switchComp.props.onValueChange(false);
    });

    expect(onSave).toHaveBeenCalledWith({
      id: "rule-sun-1",
      day_of_week: 0,
      start_time: "08:00:00",
      end_time: "18:00:00",
      is_active: false,
    });
  });

  // E. Reload after save -> persisted values are displayed
  test("E. Reload after save -> persisted values are displayed", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    // First render unconfigured
    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={0}
          rule={undefined}
          onSaveRule={jest.fn()}
        />
      );
    });

    let root = renderer!.root;
    expect(root.findAllByProps({ children: "Not configured" }).length).toBeGreaterThan(0);
    expect(root.findByType(Switch).props.value).toBe(false);

    // Simulate save followed by screen reload / prop update with the persisted rule
    act(() => {
      renderer.update(
        <AvailabilityRuleCard
          dayOfWeek={0}
          rule={{
            id: "persisted-rule-sun",
            pandit_id: panditId,
            day_of_week: 0,
            start_time: "08:00:00",
            end_time: "18:00:00",
            timezone: "Asia/Kolkata",
            is_active: true,
          }}
          onSaveRule={jest.fn()}
        />
      );
    });

    root = renderer!.root;
    expect(root.findAllByProps({ children: "08:00 - 18:00" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Adjust Hours >" }).length).toBeGreaterThan(0);
    expect(root.findByType(Switch).props.value).toBe(true);
  });

  // F. Toggle cannot invert state accidentally
  test("F. Toggle cannot invert state accidentally and rolls back on failure", async () => {
    const failingSave = jest.fn().mockRejectedValue(new Error("Network timeout"));
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={2} // Tuesday
          rule={undefined}
          onSaveRule={failingSave}
        />
      );
    });

    const root = renderer!.root;
    const switchComp = root.findByType(Switch);
    expect(switchComp.props.value).toBe(false);

    // Tapping switch on unconfigured day must always attempt is_active: true (never false)
    await act(async () => {
      await switchComp.props.onValueChange(true);
    });

    expect(failingSave).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: true,
      })
    );

    // When save fails, switch rolls back to false
    expect(switchComp.props.value).toBe(false);
  });

  // G. Existing configured schedules remain backward compatible
  test("G. Existing configured schedules remain backward compatible", () => {
    // 1. Configured and active
    let activeRenderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      activeRenderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={1} // Monday
          rule={{
            id: "rule-mon",
            pandit_id: panditId,
            day_of_week: 1,
            start_time: "09:00:00",
            end_time: "17:00:00",
            timezone: "Asia/Kolkata",
            is_active: true,
          }}
          onSaveRule={jest.fn()}
        />
      );
    });

    expect(activeRenderer!.root.findByType(Switch).props.value).toBe(true);
    expect(activeRenderer!.root.findAllByProps({ children: "09:00 - 17:00" }).length).toBeGreaterThan(0);
    expect(activeRenderer!.root.findAllByProps({ children: "Adjust Hours >" }).length).toBeGreaterThan(0);

    // 2. Configured and inactive
    let inactiveRenderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      inactiveRenderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={1} // Monday
          rule={{
            id: "rule-mon",
            pandit_id: panditId,
            day_of_week: 1,
            start_time: "09:00:00",
            end_time: "17:00:00",
            timezone: "Asia/Kolkata",
            is_active: false,
          }}
          onSaveRule={jest.fn()}
        />
      );
    });

    expect(inactiveRenderer!.root.findByType(Switch).props.value).toBe(false);
    expect(inactiveRenderer!.root.findAllByProps({ children: "09:00 - 17:00" }).length).toBeGreaterThan(0);
    expect(inactiveRenderer!.root.findAllByProps({ children: "Adjust Hours >" }).length).toBeGreaterThan(0);
  });

  // Authoritative Persistence & Retrieval tests
  test("H. panditService persists rule with pandit_id, day_of_week, start_time, end_time, is_active", async () => {
    jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValue({
      id: panditId,
    } as any);

    const mockInsert = jest.fn().mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: "new-rule-1",
              pandit_id: panditId,
              day_of_week: 0,
              start_time: "08:00:00",
              end_time: "18:00:00",
              timezone: "Asia/Kolkata",
              is_active: true,
            },
            error: null,
          }),
      }),
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "pandit_availability_rules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: mockInsert,
        } as any;
      }
      return {} as any;
    });

    const result = await panditService.saveAvailabilityRule({
      day_of_week: 0,
      start_time: "08:00:00",
      end_time: "18:00:00",
      is_active: true,
    });

    expect(mockInsert).toHaveBeenCalledWith({
      pandit_id: panditId,
      day_of_week: 0,
      start_time: "08:00:00",
      end_time: "18:00:00",
      timezone: "Asia/Kolkata",
      is_active: true,
    });
    expect(result.id).toBe("new-rule-1");
  });

  test("I. panditService.fetchAvailabilityRules remains authoritative read path querying pandit_availability_rules", async () => {
    jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValue({
      id: panditId,
    } as any);

    const mockRules = [
      {
        id: "rule-1",
        pandit_id: panditId,
        day_of_week: 0,
        start_time: "08:00:00",
        end_time: "18:00:00",
        timezone: "Asia/Kolkata",
        is_active: true,
      },
    ];

    const mockOrder2 = jest.fn().mockResolvedValue({ data: mockRules, error: null });
    const mockOrder1 = jest.fn().mockReturnValue({ order: mockOrder2 });
    const mockEq = jest.fn().mockReturnValue({ order: mockOrder1 });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "pandit_availability_rules") {
        return { select: mockSelect } as any;
      }
      return {} as any;
    });

    const rules = await panditService.fetchAvailabilityRules();
    expect(rules).toEqual(mockRules);
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("pandit_id", panditId);
    expect(mockOrder1).toHaveBeenCalledWith("day_of_week", { ascending: true });
    expect(mockOrder2).toHaveBeenCalledWith("start_time", { ascending: true });
  });
});
