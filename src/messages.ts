import { DEFAULT_LOCALE } from "./constants.js";
import { createI18n } from "./i18n.js";
import { interpolate } from "./message-rendering.js";
import type {
  MessageContext,
  MessageDescriptor,
  MessageFormatter,
  MessagePrimitive,
  MessageValues,
  PluralForms,
  SelectForms,
} from "./types.js";

/** Type helper for authoring message descriptor maps. */
export function defineMessages<const T extends Record<string, MessageDescriptor>>(messages: T): T {
  return messages;
}

/** Type helper for authoring a single message descriptor. */
export function defineMessage<const T extends MessageDescriptor>(message: T): T {
  return message;
}

/** Select a plural form using Intl.PluralRules and interpolate values. */
export function plural(
  value: number | bigint,
  forms: PluralForms,
  locale: string = DEFAULT_LOCALE,
  values: MessageValues = {},
): string {
  const category = new Intl.PluralRules(locale).select(Number(value));
  const message = forms[category] ?? forms.other;
  return renderInlineMessage(message, {
    locale,
    id: "plural",
    values: { ...values, count: value },
  });
}

/** Select a message branch by exact value with an `other` fallback. */
export function select(value: MessagePrimitive, forms: SelectForms, values: MessageValues = {}): string {
  const key = String(value);
  const message = forms[key] ?? forms.other;
  return renderInlineMessage(message, {
    locale: DEFAULT_LOCALE,
    id: "select",
    values: { ...values, value },
  });
}

function renderInlineMessage(
  message: string | MessageFormatter,
  context: Omit<MessageContext, "i18n">,
): string {
  if (typeof message === "function") {
    const i18n = createI18n({ locale: context.locale });
    return message(context.values, { ...context, i18n });
  }

  return interpolate(message, context.values);
}
