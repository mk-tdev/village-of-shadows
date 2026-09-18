/** Compare checkpoint values; arrays remain intact so message order is visible. */
export function stateChanges(before: Record<string, unknown>, after: Record<string, unknown>, prefix = ""): { path: string; before: unknown; after: unknown }[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => {
    const left = before[key], right = after[key], path = prefix ? `${prefix}.${key}` : key;
    if (JSON.stringify(left) === JSON.stringify(right)) return [];
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      return stateChanges(left as Record<string, unknown>, right as Record<string, unknown>, path);
    }
    return [{ path, before: left, after: right }];
  });
}
