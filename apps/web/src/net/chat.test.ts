import { beforeEach, describe, expect, it } from 'vitest';
import { chatArrived, chatHistory, reactionEntry, resetChat, useChat } from './chat';

const msg = (id: number, from: string, text = 'hi') => ({ id, from, text, at: 1_000 + id, round: 0, trick: null });

describe('chat store', () => {
  beforeEach(() => {
    resetChat();
    useChat.setState({ onTable: true, muted: [] });
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

  it('ignores duplicates and history replays for unread', () => {
    chatHistory([msg(1, 'a'), msg(2, 'b')]);
    chatArrived(msg(2, 'b'), 'me');
    expect(useChat.getState().log).toHaveLength(2);
    expect(useChat.getState().unread).toBe(0);
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
    chatArrived(reactionEntry('a', '🔥', 0, 1), 'me');
    expect(useChat.getState().log[0].reaction).toBe('🔥');
    expect(useChat.getState().unread).toBe(0);
  });
});
