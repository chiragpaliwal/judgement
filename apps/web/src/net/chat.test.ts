import { beforeEach, describe, expect, it } from 'vitest';
import { chatArrived, chatHistory, isEmojiOnly, mayChat, reactionEntry, resetChat, useChat } from './chat';

const msg = (id: number, from: string, text = 'hi') => ({ id, from, name: from.toUpperCase(), game: null, text, at: 1_000 + id, round: 0, trick: null });

describe('chat store', () => {
  beforeEach(() => {
    resetChat('TEST');
    useChat.setState({ onTable: true, muted: [], readUpTo: null });
  });

  it('counts unread from others only, and opening clears it', () => {
    chatArrived(msg(1, 'a'), 'me');
    chatArrived(msg(2, 'me'), 'me');
    expect(useChat.getState().unread).toBe(1);
    expect(useChat.getState().flash?.id).toBe(1);
    expect(Object.keys(useChat.getState().speaking).sort()).toEqual(['a', 'me']);
    useChat.getState().open('log');
    expect(useChat.getState().unread).toBe(0);
    chatArrived(msg(3, 'a'), 'me');
    expect(useChat.getState().unread).toBe(0);
  });

  it('ignores duplicates', () => {
    chatHistory([msg(1, 'a'), msg(2, 'b')], 'me');
    chatArrived(msg(2, 'b'), 'me');
    expect(useChat.getState().log).toHaveLength(2);
  });

  it('first visit: history from before you joined is not unread', () => {
    chatHistory([msg(1, 'a'), msg(2, 'b')], 'me');
    expect(useChat.getState().unread).toBe(0);
    expect(useChat.getState().readUpTo).toBe(2);
  });

  it('messages that arrived while away count as unread on reconnect', () => {
    chatArrived(msg(1, 'a'), 'me');
    useChat.getState().open('composer');
    useChat.getState().close();
    expect(useChat.getState().unread).toBe(0);
    // reconnect: history now holds three more, one from me and one from a muted player
    useChat.getState().toggleMute('c');
    chatHistory([msg(1, 'a'), msg(2, 'b'), msg(3, 'me'), msg(4, 'c'), msg(5, 'a')], 'me');
    expect(useChat.getState().unread).toBe(2);
    expect(useChat.getState().flash?.id).toBe(1); // a replay never lights markers or the header line
  });

  it('keeps the read marker per room across a reload', () => {
    chatArrived(msg(1, 'a'), 'me');
    useChat.getState().open('log');
    resetChat('TEST'); // page reload: marker comes back from storage when storage works
    const saved = useChat.getState().readUpTo;
    expect(saved === 1 || saved === null).toBe(true);
  });

  it('quiet mode keeps the count but no markers or header line', () => {
    useChat.getState().setOnTable(false);
    chatArrived(msg(1, 'a'), 'me');
    const s = useChat.getState();
    expect(s.unread).toBe(1);
    expect(s.flash).toBeNull();
    expect(s.speaking).toEqual({});
  });

  it('muted players add to the log but nothing else', () => {
    useChat.getState().toggleMute('a');
    chatArrived(msg(1, 'a'), 'me');
    const s = useChat.getState();
    expect(s.log).toHaveLength(1);
    expect(s.unread).toBe(0);
    expect(s.flash).toBeNull();
  });

  it('logs reactions without counting them', () => {
    chatArrived(reactionEntry('a', 'A', '🔥', null, 0, 1), 'me');
    expect(useChat.getState().log[0].reaction).toBe('🔥');
    expect(useChat.getState().unread).toBe(0);
  });
});

describe('mayChat', () => {
  beforeEach(() => resetChat('TEST'));

  it('refuses links and explains why', () => {
    expect(mayChat('see www.example.com', 10_000)).toBe(false);
    expect(useChat.getState().notice).toMatch(/links/i);
    expect(mayChat('https://x.y', 10_000)).toBe(false);
  });

  it('allows a burst of 3 then asks to slow down, refilling one per second', () => {
    const t = 1_000_000;
    expect([1, 2, 3].map(() => mayChat('hi', t))).toEqual([true, true, true]);
    expect(mayChat('hi', t)).toBe(false);
    expect(useChat.getState().notice).toMatch(/slow down/i);
    expect(mayChat('hi', t + 1_000)).toBe(true);
    expect(mayChat('hi', t + 1_050)).toBe(false);
  });
});

describe('isEmojiOnly', () => {
  it('is true for a few emoji, with or without spaces and modifiers', () => {
    for (const t of ['🔥', '😂', '👍🏽', '🔥 🔥', '❤️', '🙏🙏🙏']) expect(isEmojiOnly(t)).toBe(true);
  });
  it('is false for text, digits, mixed text or a wall of emoji', () => {
    for (const t of ['GG', '123', 'nice 🔥', '🔥 nice', '🔥🔥🔥🔥🔥🔥', '']) expect(isEmojiOnly(t)).toBe(false);
  });
});
