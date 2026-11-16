/**
 * Host half of the Last Response Stats bundle.
 *
 * `lastResponseStats` is a per-Session projection over the durable log: the
 * most recent content-bearing assistant message, its provider token usage
 * (output and prompt-cache buckets), and its decode window (first token ->
 * message settlement). The Client reads the whole value through
 * `useProjection('lastResponseStats')`; no Client-side event folding is
 * involved.
 */

const EMPTY_STATE = Object.freeze({
  /** Seq of the projected assistant/message, or -1 before the first response. */
  seq: -1,
  /** Turn and step of that response; null before the first response. */
  turn: null,
  step: null,
  /** Provider-reported output tokens, or null when the provider reported none. */
  outputTokens: null,
  /** Prompt-side token buckets; null when the provider did not report them. */
  inputTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  /** completedTime - firstTokenTime in milliseconds, or null when undecidable. */
  decodeMs: null,
  /** First token delta timestamp, or null when the stream records none. */
  firstTokenTime: null,
  /** assistant/message settlement timestamp, or null before the first response. */
  completedTime: null,
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isNullableCount(value) {
  return value === null || isCount(value);
}

function isNullableNumber(value) {
  return value === null || isFiniteNumber(value);
}

/**
 * Validate one projection state/view value. The registry calls only `parse`
 * on these schemas; the structural checks keep a malformed persisted-cache
 * row from seeding a fold.
 * @param {unknown} value
 * @returns {{ seq: number, turn: number | null, step: number | null, outputTokens: number | null, inputTokens: number | null, cacheReadTokens: number | null, cacheWriteTokens: number | null, decodeMs: number | null, firstTokenTime: number | null, completedTime: number | null }}
 */
function parseState(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('lastResponseStats state must be an object');
  }
  const {
    seq,
    turn,
    step,
    outputTokens,
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    decodeMs,
    firstTokenTime,
    completedTime,
  } = value;
  if (!Number.isSafeInteger(seq) || seq < -1) {
    throw new TypeError('lastResponseStats seq must be an integer >= -1');
  }
  if (!(turn === null || (Number.isSafeInteger(turn) && turn >= 0))) {
    throw new TypeError('lastResponseStats turn must be a non-negative integer or null');
  }
  if (!(step === null || (Number.isSafeInteger(step) && step >= 0))) {
    throw new TypeError('lastResponseStats step must be a non-negative integer or null');
  }
  if (!isNullableCount(outputTokens)) {
    throw new TypeError('lastResponseStats outputTokens must be a non-negative integer or null');
  }
  if (!isNullableCount(inputTokens)) {
    throw new TypeError('lastResponseStats inputTokens must be a non-negative integer or null');
  }
  if (!isNullableCount(cacheReadTokens)) {
    throw new TypeError('lastResponseStats cacheReadTokens must be a non-negative integer or null');
  }
  if (!isNullableCount(cacheWriteTokens)) {
    throw new TypeError('lastResponseStats cacheWriteTokens must be a non-negative integer or null');
  }
  if (!isNullableCount(decodeMs)) {
    throw new TypeError('lastResponseStats decodeMs must be a non-negative integer or null');
  }
  if (!isNullableNumber(firstTokenTime)) {
    throw new TypeError('lastResponseStats firstTokenTime must be a finite number or null');
  }
  if (!isNullableNumber(completedTime)) {
    throw new TypeError('lastResponseStats completedTime must be a finite number or null');
  }
  return {
    seq,
    turn,
    step,
    outputTokens,
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    decodeMs,
    firstTokenTime,
    completedTime,
  };
}

const stateSchema = { parse: parseState };
const viewSchema = { parse: parseState };

/**
 * Whether one assistant message carries a visible reply. This mirrors the
 * Chat target's closing-response rule: reasoning-only and tool-call-only
 * messages are protocol material, not a response.
 * @param {unknown} content
 * @returns {boolean}
 */
function hasVisibleReply(content) {
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type === 'reasoning' || block.type === 'tool-call') continue;
    if (block.type === 'text') {
      if (typeof block.text === 'string' && block.text.trim() !== '') return true;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Whether one stream chunk is the first output token for latency purposes.
 * @param {unknown} chunk
 * @returns {boolean}
 */
function isTokenChunk(chunk) {
  if (chunk === null || typeof chunk !== 'object') return false;
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return typeof chunk.text === 'string' && chunk.text !== '';
    case 'tool-call-delta':
      return (
        (typeof chunk.argumentsDelta === 'string' && chunk.argumentsDelta !== '') ||
        chunk.name !== undefined
      );
    default:
      return false;
  }
}

/**
 * Reconstruct the first token time from the durable compact stream records,
 * matching `assistantStreamFirstTokenTime` semantics.
 * @param {unknown} stream
 * @returns {number | null}
 */
function firstTokenTimeOfStream(stream) {
  if (!Array.isArray(stream)) return null;
  for (const record of stream) {
    if (record === null || typeof record !== 'object') continue;
    if (record.type === 'chunk') {
      if (isTokenChunk(record.chunk) && isFiniteNumber(record.time)) return record.time;
      continue;
    }
    if (
      record.type !== 'text-chunks' &&
      record.type !== 'reasoning-chunks' &&
      record.type !== 'tool-call-chunks'
    ) {
      continue;
    }
    if (!isFiniteNumber(record.time0)) continue;
    if (record.type === 'tool-call-chunks' && record.name !== undefined) return record.time0;
    const members = record.type === 'tool-call-chunks' ? record.args : record.texts;
    const dt = record.dt;
    if (!Array.isArray(members) || !Array.isArray(dt)) continue;
    let time = record.time0;
    for (let index = 0; index < members.length; index += 1) {
      if (index > 0) {
        const delta = dt[index - 1];
        if (!isFiniteNumber(delta)) {
          time = null;
          break;
        }
        time += delta;
      }
      const member = members[index];
      if (typeof member === 'string' && member !== '') return time;
    }
  }
  return null;
}

/**
 * Provider token usage for one assistant/message, preferring the event's
 * usage and falling back to the final usage chunk in its embedded stream.
 * @param {any} event
 * @returns {{ outputTokens: number, inputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number } | null}
 */
function usageOf(event) {
  const usage = event.data.usage;
  if (usage !== null && typeof usage === 'object' && isCount(usage.outputTokens)) {
    return usage;
  }
  const stream = event.data.stream;
  if (!Array.isArray(stream)) return null;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record === null || typeof record !== 'object' || record.type !== 'chunk') continue;
    const chunk = record.chunk;
    if (chunk === null || typeof chunk !== 'object' || chunk.type !== 'usage') continue;
    const streamed = chunk.usage;
    if (streamed !== null && typeof streamed === 'object' && isCount(streamed.outputTokens)) {
      return streamed;
    }
  }
  return null;
}

/**
 * Pure projection transition. Unrelated events return the same state
 * reference so the registry's Object.is gate stays quiet.
 * @param {typeof EMPTY_STATE} state
 * @param {any} event
 * @returns {typeof EMPTY_STATE}
 */
function fold(state, event) {
  if (event.type !== 'assistant/message' || event.surfaceOp !== 'append') return state;
  if (event.seq <= state.seq) return state;
  const message = event.data.message;
  if (message === null || typeof message !== 'object' || !hasVisibleReply(message.content)) {
    return state;
  }
  const completedTime = event.time;
  if (!isFiniteNumber(completedTime)) return state;
  const firstTokenTime = firstTokenTimeOfStream(event.data.stream);
  const usage = usageOf(event);
  const outputTokens = usage !== null && isCount(usage.outputTokens) ? usage.outputTokens : null;
  const inputTokens = usage !== null && isCount(usage.inputTokens) ? usage.inputTokens : null;
  const cacheReadTokens = usage !== null && isCount(usage.cacheReadTokens) ? usage.cacheReadTokens : null;
  const cacheWriteTokens = usage !== null && isCount(usage.cacheWriteTokens) ? usage.cacheWriteTokens : null;
  const decodeMs =
    firstTokenTime !== null && completedTime > firstTokenTime
      ? completedTime - firstTokenTime
      : null;
  return {
    seq: event.seq,
    turn: event.data.turn,
    step: event.data.step,
    outputTokens,
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    decodeMs,
    firstTokenTime,
    completedTime,
  };
}

export const inject = ['sessionProjections'];

/**
 * Register the per-Session projection unit.
 * @param {any} ctx - owning Host plugin context.
 */
export function apply(ctx) {
  ctx.sessionProjections.register({
    key: 'lastResponseStats',
    stateSchema,
    stateVersion: 2,
    init: () => EMPTY_STATE,
    apply: fold,
    wire: {
      viewSchema,
      view: (state) => state,
    },
  });
}
