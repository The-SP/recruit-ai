import { Kbd, KbdGroup } from "@/components/ui/kbd";

/** Ctrl+Enter, or Cmd+Enter on a Mac: sends an answer from either composer. */
export function isSendShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean }) {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

export function SendShortcutHint() {
  return (
    <KbdGroup>
      <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd>+<Kbd>Enter</Kbd>
    </KbdGroup>
  );
}
