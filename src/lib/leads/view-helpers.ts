import { safeExternalUrl } from "@/lib/text";
import { formatDateTime, truncate } from "@/lib/utils";

export { formatDateTime, truncate };

/** Only http(s) links are rendered as anchors. */
export function safeLink(value: string | null): string | null {
  return safeExternalUrl(value);
}
