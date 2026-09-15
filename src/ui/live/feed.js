// The running commentary down the side of the picture.
//
// Live mode hid the duel log, which left the player watching an edit with no
// idea what had just happened mechanically -- a monster is destroyed on screen
// and nothing says which, or by how much. This is that log, cut down to what
// reads at a glance over video: the last few lines, newest at the bottom, older
// ones fading out rather than scrolling away.

const SHOWN = 7;

/**
 * The last few lines of the duel log.
 *
 * Nothing is filtered by weight. An earlier version dropped structural lines
 * that did not mention a phase, which quietly threw away the single most
 * important line in the duel -- the one saying who won. Phase lines are made
 * visually quieter instead, which is what "structural" is for.
 */
export function recentLines(lines, limit = SHOWN) {
  return lines.filter((line) => line?.text).slice(-limit);
}

export function renderFeed(container, lines, { turn } = {}) {
  if (!container) return;
  const shown = recentLines(lines);
  container.innerHTML = "";

  if (turn) {
    const head = document.createElement("p");
    head.className = "feed-turn";
    head.textContent = `TURN ${turn}`;
    container.append(head);
  }

  shown.forEach((line, index) => {
    const row = document.createElement("p");
    row.className = `feed-line is-${line.weight ?? "mechanical"}`;
    // The oldest visible line is nearly gone: the eye should land on the newest.
    const age = shown.length - 1 - index;
    row.style.setProperty("--age", String(age));
    row.textContent = line.text ?? "";
    if (line.detail) {
      const detail = document.createElement("span");
      detail.className = "feed-detail";
      detail.textContent = line.detail;
      row.append(detail);
    }
    container.append(row);
  });
  container.scrollTop = container.scrollHeight;
}
