import type {
  MessageContext,
  MessageFormatter,
  MessageValues,
} from "./types.js";

export function renderMessage(message: string | MessageFormatter, context: MessageContext): string {
  if (typeof message === "function") {
    return message(context.values, context);
  }

  return interpolate(message, context.values);
}

export function interpolate(message: string, values: MessageValues): string {
  return message.replace(/\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}/gu, (placeholder, doubleName, singleName) => {
    const key = typeof doubleName === "string" && doubleName.length > 0 ? doubleName : singleName;
    const value = values[key];

    if (value === undefined || value === null) {
      return placeholder;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return String(value);
  });
}
