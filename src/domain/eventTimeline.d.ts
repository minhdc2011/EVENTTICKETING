export const TIMELINE_HEADING: string;
export function stripTimelineFromDescription(description?: string | null): string;
export function embedTimelineInDescription(
  description: string | null | undefined,
  schedule?: Array<{startTime?: string; endTime?: string; title?: string; description?: string; order?: number}> | null,
): string;
