export type VelocityWindow = "today" | "week" | "month" | "ytd" | "all";

export interface WindowRange {
  start: Date | null;
  end: Date;
  prevStart: Date | null;
  prevEnd: Date | null;
  bucket: "day" | "week" | "month";
  bucketCount: number;
}

// ISO week starts Monday. All ranges are half-open [start, end) UTC-normalized to
// calendar-day boundaries so that SQL `applied_date >= start AND applied_date < end`
// behaves identically to the UI's count.
export function resolveWindow(win: VelocityWindow, now: Date = new Date()): WindowRange {
  const end = startOfDayUTC(addDays(now, 1)); // exclusive upper bound = tomorrow 00:00 UTC

  switch (win) {
    case "today": {
      const start = startOfDayUTC(now);
      return {
        start,
        end,
        prevStart: addDays(start, -1),
        prevEnd: start,
        bucket: "day",
        bucketCount: 1,
      };
    }
    case "week": {
      const start = startOfIsoWeekUTC(now);
      return {
        start,
        end,
        prevStart: addDays(start, -7),
        prevEnd: start,
        bucket: "day",
        bucketCount: 7,
      };
    }
    case "month": {
      const start = startOfMonthUTC(now);
      const prevStart = startOfMonthUTC(addDays(start, -1));
      return {
        start,
        end,
        prevStart,
        prevEnd: start,
        bucket: "day",
        bucketCount: daysInMonth(start),
      };
    }
    case "ytd": {
      const start = startOfYearUTC(now);
      const prevStart = startOfYearUTC(addDays(start, -1));
      return {
        start,
        end,
        prevStart,
        prevEnd: start,
        bucket: "month",
        bucketCount: now.getUTCMonth() + 1,
      };
    }
    case "all":
      return {
        start: null,
        end,
        prevStart: null,
        prevEnd: null,
        bucket: "month",
        bucketCount: 12,
      };
  }
}

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// ISO week: Monday is day 1, Sunday is day 7.
export function startOfIsoWeekUTC(d: Date): Date {
  const day = startOfDayUTC(d);
  const dow = day.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(day, delta);
}

export function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function startOfYearUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function daysInMonth(monthStart: Date): number {
  const next = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  return Math.round((next.getTime() - monthStart.getTime()) / 86400000);
}

export function describeWindow(win: VelocityWindow): string {
  switch (win) {
    case "today":
      return "Today";
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "ytd":
      return "Year to date";
    case "all":
      return "All time";
  }
}
