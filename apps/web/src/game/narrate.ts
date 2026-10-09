// Sentences the UI shows. Pure functions of game state. Names only, never pronouns.
import {
  biddingOrder,
  bidTotal,
  cardLabel,
  hookedBid,
  isOut,
  ledSuit,
  need,
  openTrick,
  rankOf,
  suitOf,
  SUIT_NAMES,
  tricksLeft,
  winningIndex,
  wouldLead,
  type Card,
  type GameView,
  type RoundRecord,
  type Suit,
  type Trick,
} from '@judgement/engine';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = (n: number) => WORDS[n] ?? String(n);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const singular = (s: Suit) => SUIT_NAMES[s].slice(0, -1);
const poss = (name: string) => (name === 'You' ? 'your' : `${name}’s`);

/** "You" only capitalised at the start of a sentence. */
export const mid = (name: string) => (name === 'You' ? 'you' : name);

/** "Ira and Mei", "You, Ira and Mei" ("you" lower-cased when not first). */
export function joinNames(names: string[]): string {
  const ns = names.map((n, i) => (i === 0 ? n : mid(n)));
  if (ns.length <= 1) return ns[0] ?? '';
  return `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

/** The trick on the table right now (open trick, or null between tricks). */
export function currentPlays(game: GameView) {
  return openTrick(game.round)?.plays ?? [];
}

/** Your-turn header: "Follow ♦ · 2 playable" or "You lead · any card". */
export function turnHeader(game: GameView, playable: number) {
  const led = ledSuit(currentPlays(game));
  return led ? { lead: false as const, suit: led, playable } : { lead: true as const, suit: null, playable };
}

/** Hint under the fan for the selected card. */
export function hintLine(game: GameView, card: Card, names: string[]): string {
  const plays = currentPlays(game);
  const trump = game.round.trump;
  const c = cardLabel(card);
  if (!plays.length) {
    return suitOf(card) === trump ? `You lead the ${c}, a trump.` : `You lead with the ${c}.`;
  }
  const best = plays[winningIndex(plays, trump)];
  const who = names[best.seat];
  const top = `${poss(who)} ${cardLabel(best.card)}`;
  if (wouldLead(card, plays, trump)) {
    if (suitOf(card) === trump && suitOf(best.card) !== trump) return `The ${c} trumps ${top} and takes the lead.`;
    return `The ${c} beats ${top} and takes the lead.`;
  }
  return `The ${c} won’t beat ${top}. ${who} stays on top.`;
}

/** One line under "Your hand" while waiting in play. */
export function waitLine(game: GameView, names: string[]): string {
  const r = game.round;
  const plays = currentPlays(game);
  const next = names[r.turn];
  if (plays.length === game.n - 1) return `${next} plays next, then the trick closes`;
  if (!plays.length) return `${next} leads the next trick`;
  return `${next} plays next`;
}

/** Centre-pill note during bidding. */
export function bidNote(game: GameView, names: string[]): string {
  const r = game.round;
  const order = biddingOrder(r.dealer, game.n);
  const left = order.filter((s) => r.bids[s] === null);
  if (!left.length) return 'Everyone has bid';
  if (r.cards === 1 && game.plan.length - 1 === r.index) return 'Last round · one trick decides it';
  if (left.length === 1 && left[0] === r.dealer) {
    const h = hookedBid(r, r.dealer);
    const who = names[r.dealer] === 'You' ? 'You deal' : `${names[r.dealer]} deals`;
    return h === null ? `${who} · anything goes` : `${who} · can’t make it ${r.cards}`;
  }
  if (left.length > 2) return `${left.length} still to bid · ${names[left[0]] === 'You' ? 'you’re' : `${names[left[0]]}’s`} up`;
  return `${joinNames(left.map((s) => names[s]))} still to bid`;
}

export function hookText(hooked: number): string {
  return `You can’t bid ${hooked}. Whatever you pick, the table won’t add up, so someone misses this round.`;
}

/** Caption beside the hero card in a 1-card round. */
export function heroCaption(game: GameView, card: Card, names: string[]): { title: string; body: string } {
  const r = game.round;
  const trump = r.trump;
  const leader = names[(r.dealer + 1) % game.n];
  const others = game.n - 1;
  const isTrump = suitOf(card) === trump;
  const high = rankOf(card) >= 13;
  const title = isTrump
    ? high
      ? 'Your only card is a high trump.'
      : 'Your only card is a trump.'
    : high
      ? `Your only card is a high ${singular(suitOf(card))}.`
      : `Your only card is the ${cardLabel(card)}.`;
  const lead = leader === 'You' ? 'You lead.' : `${leader} leads.`;
  return { title, body: `${lead} ${cap(word(others))} other cards are out there and you can’t see any of them.` };
}

/** Headline for the moment panel on the last trick. */
export function lastTrickHeadline(game: GameView, names: string[]): { title: string; body: string } {
  const r = game.round;
  const plays = currentPlays(game);
  const needers = r.bids.map((_, i) => i).filter((i) => !isOut(r, i) && need(r.bids[i], r.won[i]) > 0);
  const top = plays.length ? plays[winningIndex(plays, r.trump)] : null;
  const topText = top ? `${cap(poss(names[top.seat]))} ${cardLabel(top.card)} is on top.` : '';
  if (needers.length === 0) return { title: 'Nobody needs this one.', body: topText };
  if (needers.length === 1) {
    const n = names[needers[0]];
    return { title: n === 'You' ? 'You need this one.' : `${n} needs this one.`, body: topText };
  }
  return { title: `${joinNames(needers.map((i) => names[i]))} all need it.`, body: topText };
}

export function recapHeadline(rec: RoundRecord): { made: number; missed: number } {
  let made = 0;
  rec.bids.forEach((b, i) => (b === rec.won[i] ? made++ : 0));
  return { made, missed: rec.bids.length - made };
}

/** One-line recap under the round summary headline. */
export function recapLine(rec: RoundRecord, names: string[], lastTrick: Trick | null): string {
  const total = rec.bids.reduce((a, b) => a + b, 0);
  const diff = total - rec.cards;
  let s =
    diff === 0
      ? `The table bid exactly ${rec.cards}.`
      : `The table bid ${total} into ${plural(rec.cards, 'trick')}.`;
  if (lastTrick && lastTrick.winner !== null && rec.cards > 1) {
    const w = lastTrick.winner;
    if (rec.won[w] === rec.bids[w] && rec.bids[w] > 0) s += ` ${names[w]} took the last one to land ${rec.bids[w]}.`;
    else if (rec.won[w] > rec.bids[w] && rec.won[w] - 1 === rec.bids[w])
      s += ` ${names[w]} got stuck with the last one.`;
  }
  return s;
}

/** Ranks with ties sharing a rank: [1, 2, 2, 4]. Input sorted descending. */
export function sharedRanks(totals: number[]): number[] {
  return totals.map((t) => totals.findIndex((x) => x === t) + 1);
}

/** One-line story for the final results. */
export function storyLine(history: RoundRecord[], names: string[]): string {
  if (!history.length) return 'The game ended before a round was scored.';
  const n = names.length;
  const totals = Array(n).fill(0);
  const leaderAfter: number[] = [];
  for (const h of history) {
    h.points.forEach((p, i) => (totals[i] += p));
    const max = Math.max(...totals);
    leaderAfter.push(totals.indexOf(max));
  }
  const order = totals.map((t, i) => [t, i] as const).sort((a, b) => b[0] - a[0]);
  const [first, second] = order;
  if (!second) return '';
  const gap = first[0] - second[0];
  if (gap === 0) {
    const tied = order.filter((o) => o[0] === first[0]).map((o) => names[o[1]]);
    return `${joinNames(tied)} finish level on ${first[0]}.`;
  }
  const gapText = `${cap(gap <= 12 ? word(gap) : String(gap))} point${gap === 1 ? '' : 's'} clear of ${mid(names[second[1]])}.`;
  const lastLeader = leaderAfter[leaderAfter.length - 2];
  const changedLate = history.length > 1 && lastLeader !== first[1];
  if (changedLate) return `${gapText} It came down to the ${history[history.length - 1].cards}-card round.`;
  const fromRound = leaderAfter.findIndex((_, i) => leaderAfter.slice(i).every((l) => l === first[1]));
  return fromRound <= 0 ? `${gapText} Led from the first round to the last.` : `${gapText} In front from round ${fromRound + 1} on.`;
}

export { bidTotal };
