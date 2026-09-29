import { HEALTH } from "./constants";
import { formatDate } from "./dates";

/** Health values, dates and text all live in the change log as strings. This reads them back for display. Pure, safe in the browser. */
export function displayValue(field: string, value: string | null): string {
  if (value === null || value === "") return "none";
  if (field === "health") return HEALTH[value as keyof typeof HEALTH]?.label ?? value;
  if (/_date$|^date$/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (field === "status" && value === "done") return "Done";
  return value;
}
