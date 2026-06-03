import type { I18n } from "../i18n.js";
import type {
  I18nKeysOf,
  I18nSnapshot,
  ReactI18nBindings,
  ReactRuntimeLike,
} from "../types.js";

/**
 * Create React hooks and Provider from a React-like runtime.
 *
 * React is intentionally not bundled; pass `import * as React from "react"`.
 * When `i18n` came from {@link composeI18nModules}, `useT()` autocompletes the
 * composed translation keys; a plain I18n falls back to accepting any string.
 */
export function createReactI18n<Element = unknown, T extends I18n = I18n>(
  i18n: T,
  react: ReactRuntimeLike<Element>,
): ReactI18nBindings<I18nKeysOf<T>, Element> {
  const I18nContext = react.createContext(i18n);

  const subscribeToI18n = (current: I18n) => (onStoreChange: () => void) =>
    current.subscribe(() => {
      onStoreChange();
    });

  const useI18n = (): I18n => {
    const current = react.useContext(I18nContext);
    react.useSyncExternalStore(
      subscribeToI18n(current),
      current.getSnapshot,
      current.getSnapshot,
    );
    return current;
  };

  const useI18nSnapshot = (): I18nSnapshot => {
    const current = react.useContext(I18nContext);
    return react.useSyncExternalStore(
      subscribeToI18n(current),
      current.getSnapshot,
      current.getSnapshot,
    );
  };

  return {
    I18nContext,
    I18nProvider(props) {
      if (!react.createElement) {
        throw new Error("createReactI18n requires react.createElement to render I18nProvider");
      }

      return react.createElement(
        I18nContext.Provider,
        { value: props.value ?? i18n },
        props.children,
      );
    },
    useI18n,
    useI18nSnapshot,
    useT() {
      const current = useI18n();
      return current.t.bind(current);
    },
    useLocale() {
      return useI18nSnapshot().locale;
    },
  };
}
