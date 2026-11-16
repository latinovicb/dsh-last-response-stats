window.__ModuleLoader__.load({
  id: 'dsh-last-response-stats',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'last-response-stats';

    const EN = {
      label: '{value} tok/s',
      title: 'Average generation speed for the last response',
      detail: '{tokens} output tokens over {seconds} s',
      cacheLabel: '{percent}% cached',
      cacheTitle: 'Prompt cache hit for the last response',
      cacheDetail: '{cached} of {prompt} prompt tokens served from cache',
    };
    const ZH = {
      label: '{value} tok/s',
      title: '最近一次回复的平均生成速度',
      detail: '最近一次回复：{tokens} 个输出 token，用时 {seconds} 秒',
      cacheLabel: '{percent}% 已缓存',
      cacheTitle: '最近一次回复的提示词缓存命中',
      cacheDetail: '提示词缓存命中 {cached}/{prompt} 个 token',
    };

    const CSS = [
      '.dshLastResponseSpeed {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  min-width: 0;',
      '  max-width: 100%;',
      '  color: var(--dsw-alias-label-tertiary);',
      '  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);',
      '  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));',
      '  font-variant-numeric: tabular-nums;',
      '  white-space: nowrap;',
      '  user-select: none;',
      '}',
      '.dshLastResponseSpeedIcon { flex: none; width: 14px; height: 14px; }',
      '.dshLastResponseSpeedLabel { overflow: hidden; text-overflow: ellipsis; }',
    ].join('\n');

    function formatSpeed(tokensPerSecond) {
      const clamped = Math.max(0, tokensPerSecond);
      return clamped >= 10
        ? String(Math.round(clamped))
        : String(Math.round(clamped * 10) / 10);
    }

    function formatCount(value) {
      try {
        return Math.round(value).toLocaleString();
      } catch {
        return String(Math.round(value));
      }
    }

    function formatSeconds(milliseconds) {
      return (milliseconds / 1000).toFixed(1);
    }

    function formatCacheHitPercent(cacheReadTokens, promptTokens) {
      if (promptTokens <= 0 || cacheReadTokens < 0 || cacheReadTokens > promptTokens) {
        return null;
      }
      if (cacheReadTokens === promptTokens) return '100';
      const percent = (cacheReadTokens / promptTokens) * 100;
      if (percent >= 99) return String(Math.floor(percent * 10) / 10);
      if (percent >= 10) return String(Math.round(percent));
      return String(Math.round(percent * 10) / 10);
    }

    function cacheHitReading(stats) {
      const inputTokens = stats.inputTokens;
      const cacheReadTokens = stats.cacheReadTokens;
      if (typeof inputTokens !== 'number' || typeof cacheReadTokens !== 'number') {
        return null;
      }
      const cacheWriteTokens = typeof stats.cacheWriteTokens === 'number' ? stats.cacheWriteTokens : 0;
      const promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens;
      const percent = formatCacheHitPercent(cacheReadTokens, promptTokens);
      if (percent === null) return null;
      return { percent, cachedTokens: cacheReadTokens, promptTokens };
    }

    function GaugeIcon() {
      return h(
        'svg',
        {
          className: 'dshLastResponseSpeedIcon',
          viewBox: '0 0 24 24',
          width: 14,
          height: 14,
          'aria-hidden': true,
          focusable: 'false',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('path', { d: 'M4.5 17.5a7.5 7.5 0 0 1 15 0' }),
        h('path', { d: 'M12 17.5l4-6' }),
        h('circle', { cx: 12, cy: 17.5, r: 1.2, fill: 'currentColor', stroke: 'none' }),
      );
    }

    /**
     * Quiet reading under one completed Turn. The projection carries the
     * latest response's Turn, so only that Turn's tail renders a value.
     */
    function LastResponseSpeed({ turn, useProjection, t }) {
      const stats = useProjection('lastResponseStats');
      const turnNumber =
        typeof turn === 'number'
          ? turn
          : turn !== null && typeof turn === 'object'
            ? turn.turn
            : undefined;
      if (stats === undefined || turnNumber === undefined || stats.turn !== turnNumber) {
        return null;
      }

      const outputTokens = stats.outputTokens;
      const decodeMs = stats.decodeMs;
      const hasSpeed =
        typeof outputTokens === 'number' &&
        outputTokens > 0 &&
        typeof decodeMs === 'number' &&
        decodeMs > 0;
      const tokensPerSecond = hasSpeed ? outputTokens / (decodeMs / 1000) : null;
      const hasFiniteSpeed =
        tokensPerSecond !== null && Number.isFinite(tokensPerSecond) && tokensPerSecond > 0;
      const cache = cacheHitReading(stats);
      if (!hasFiniteSpeed && cache === null) return null;

      const speedLabel = hasFiniteSpeed
        ? t('label', { value: formatSpeed(tokensPerSecond) })
        : null;
      const cacheLabel = cache !== null ? t('cacheLabel', { percent: cache.percent }) : null;
      const label = [speedLabel, cacheLabel].filter(Boolean).join(' · ');

      const titleParts = [];
      if (speedLabel !== null) {
        titleParts.push(
          `${t('title')} · ${t('detail', {
            tokens: formatCount(outputTokens),
            seconds: formatSeconds(decodeMs),
          })}`,
        );
      }
      if (cache !== null) {
        titleParts.push(
          `${t('cacheTitle')} · ${t('cacheDetail', {
            cached: formatCount(cache.cachedTokens),
            prompt: formatCount(cache.promptTokens),
          })}`,
        );
      }

      const data = {};
      if (speedLabel !== null) {
        data['data-output-tokens'] = outputTokens;
        data['data-decode-ms'] = decodeMs;
      }
      if (cache !== null) {
        data['data-cache-hit-percent'] = cache.percent;
        data['data-cache-read-tokens'] = cache.cachedTokens;
        data['data-prompt-tokens'] = cache.promptTokens;
      }

      return h(
        'span',
        {
          className: 'dshLastResponseSpeed',
          'data-last-response-speed': true,
          ...data,
          title: titleParts.join(' · '),
          'aria-label': label,
        },
        h(GaugeIcon),
        h('span', { className: 'dshLastResponseSpeedLabel' }, label),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en: EN, zh: ZH }),
          'dsh-last-response-stats: dictionaries',
        );

        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.lastResponseStats = 'dsh-last-response-stats';
          tag.textContent = CSS;
          document.head.append(tag);
          return () => tag.remove();
        }, 'dsh-last-response-stats: styles');

        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register(
            {
              name: 'conversation.chat.turnTail',
              id: 'dsh-last-response-stats',
              order: 20,
              locale: NS,
            },
            LastResponseSpeed,
          ),
        );
      },
    };
  },
});
