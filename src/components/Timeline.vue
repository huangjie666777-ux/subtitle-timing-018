<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useWorkbench } from '../stores/workbench';
import type { Cue } from '../lib/srt';
import { formatClock } from '../lib/srt';

const wb = useWorkbench();
const scrollEl = ref<HTMLElement | null>(null);
const trackEl = ref<HTMLElement | null>(null);

interface LaidOut extends Cue {
  lane: number;
}

const PAD_MS = 2000;
const ROW_HEIGHT = 46;
const RULER_HEIGHT = 30;

const laneData = computed(() => {
  const ordered = [...wb.state.cues].sort((a, b) => a.start - b.start || a.id - b.id);
  const laneEnds: number[] = [];
  const items = ordered.map((cue) => {
    let lane = laneEnds.findIndex((end) => end <= cue.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(cue.end);
    } else {
      laneEnds[lane] = cue.end;
    }
    return { ...cue, lane };
  });
  return { items, lanes: Math.max(1, laneEnds.length) };
});

const maxEnd = computed(() =>
  wb.state.cues.reduce((max, cue) => Math.max(max, cue.end), 0),
);
const durationMs = computed(() => maxEnd.value + PAD_MS);
const trackWidth = computed(() => Math.max(900, (durationMs.value * wb.ui.pxPerSec) / 1000));
const trackHeight = computed(() => RULER_HEIGHT + laneData.value.lanes * ROW_HEIGHT + 40);

function px(ms: number): number {
  return (ms * wb.ui.pxPerSec) / 1000;
}

function msFromEvent(event: PointerEvent): number {
  const rect = trackEl.value?.getBoundingClientRect();
  if (!rect) return 0;
  return Math.max(0, Math.round(((event.clientX - rect.left) / wb.ui.pxPerSec) * 1000));
}

const ticks = computed(() => {
  const choices = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
  const interval = choices.find((ms) => (ms * wb.ui.pxPerSec) / 1000 >= 70) ?? 600000;
  const list: { ms: number; major: boolean }[] = [];
  for (let t = 0; t <= durationMs.value; t += interval) {
    list.push({ ms: t, major: true });
  }
  return { list, interval };
});

type DragMode = 'move' | 'start' | 'end';
interface DragSession {
  base: ReturnType<typeof wb.beginDrag>;
  ids: number[];
  mode: DragMode;
  startClientX: number;
  started: boolean;
  pointerId: number;
}
let drag: DragSession | null = null;

function blockPointerDown(event: PointerEvent, cue: Cue, mode: DragMode): void {
  event.preventDefault();
  event.stopPropagation();
  if (mode === 'move' && !wb.state.selected.includes(cue.id)) {
    wb.selectCue(cue.id, event.ctrlKey || event.metaKey, event.shiftKey);
  } else if (mode === 'move' && event.ctrlKey) {
    wb.selectCue(cue.id, true, false);
  }
  const ids = mode === 'move' && wb.state.selected.includes(cue.id) ? wb.state.selected : [cue.id];
  drag = {
    base: wb.beginDrag(),
    ids,
    mode,
    startClientX: event.clientX,
    started: false,
    pointerId: event.pointerId,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;
  const deltaPx = event.clientX - drag.startClientX;
  if (!drag.started && Math.abs(deltaPx) < 3) return;
  drag.started = true;
  const deltaMs = Math.round((deltaPx / wb.ui.pxPerSec) * 1000);
  wb.previewDrag(drag.base, drag.ids, deltaMs, drag.mode === 'move' ? null : drag.mode);
}

function onPointerUp(): void {
  if (!drag) return;
  if (drag.started) wb.commitDrag(drag.base);
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && drag) {
    wb.cancelDrag(drag.base);
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('keydown', onKeyDown);
});

function rulerPointerDown(event: PointerEvent): void {
  wb.setPlayhead(msFromEvent(event));
  const move = (ev: PointerEvent) => wb.setPlayhead(msFromEvent(ev));
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  wb.ui.pxPerSec = Math.min(400, Math.max(5, Number((wb.ui.pxPerSec * factor).toFixed(2))));
}

let rafId = 0;
let lastFrame = 0;
function togglePlay(): void {
  wb.ui.playing = !wb.ui.playing;
  if (wb.ui.playing) {
    lastFrame = performance.now();
    const tick = (now: number) => {
      if (!wb.ui.playing) return;
      const delta = now - lastFrame;
      lastFrame = now;
      let next = wb.ui.playhead + delta;
      if (next > durationMs.value) next = 0;
      wb.setPlayhead(next);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(rafId);
  }
}
onBeforeUnmount(() => cancelAnimationFrame(rafId));

function blockClass(id: number): Record<string, boolean> {
  return {
    selected: wb.state.selected.includes(id),
    conflict: wb.conflictIds.value.has(id),
    'on-air': wb.previewCues.value.some((cue) => cue.id === id),
  };
}

function partnerId(cue: Cue): number {
  const c = wb.conflicts.value.find((item) => item.a === cue.id || item.b === cue.id);
  if (!c) return cue.id;
  return c.a === cue.id ? c.b : c.a;
}

function zoomToFit(): void {
  const width = scrollEl.value?.clientWidth ?? 900;
  wb.ui.pxPerSec = Math.min(400, Math.max(5, Number(((width - 40) / (durationMs.value / 1000)).toFixed(2))));
}
</script>

<template>
  <section class="panel timeline" aria-label="可缩放时间轴">
    <header class="panel-head timeline-head">
      <h2>时间轴</h2>
      <div class="timeline-tools">
        <button type="button" @click="togglePlay">{{ wb.ui.playing ? '暂停' : '播放' }}</button>
        <span class="mono clock">{{ formatClock(wb.ui.playhead) }}</span>
        <label class="zoom">缩放
          <input v-model.number="wb.ui.pxPerSec" type="range" min="5" max="400" step="1" />
          <span class="mono">{{ wb.ui.pxPerSec }}px/s</span>
        </label>
        <button type="button" @click="zoomToFit">适应宽度</button>
        <span class="hint">Ctrl+滚轮缩放 · 拖块移动 · 拖两端改时长 · Esc 取消拖动</span>
      </div>
    </header>
    <div ref="scrollEl" class="timeline-scroll" @wheel="onWheel">
      <div
        ref="trackEl"
        class="track"
        :style="{ width: trackWidth + 'px', height: trackHeight + 'px' }"
      >
        <div class="ruler" :style="{ height: RULER_HEIGHT + 'px' }" @pointerdown="rulerPointerDown">
          <span
            v-for="tick in ticks.list"
            :key="tick.ms"
            class="tick"
            :style="{ left: px(tick.ms) + 'px' }"
            >{{ formatClock(tick.ms) }}</span
          >
        </div>
        <div class="lanes" :style="{ top: RULER_HEIGHT + 'px', height: laneData.lanes * ROW_HEIGHT + 'px' }">
          <div
            v-for="n in laneData.lanes"
            :key="n"
            class="lane"
            :style="{ top: (n - 1) * ROW_HEIGHT + 'px', height: ROW_HEIGHT - 4 + 'px' }"
          ></div>
          <div
            v-for="cue in laneData.items"
            :key="cue.id"
            class="cue-block"
            :class="blockClass(cue.id)"
            :style="{
              left: px(cue.start) + 'px',
              width: Math.max(6, px(cue.end - cue.start)) + 'px',
              top: cue.lane * ROW_HEIGHT + 4 + 'px',
            }"
            @pointerdown="blockPointerDown($event, cue, 'move')"
          >
            <span class="edge edge-start" @pointerdown="blockPointerDown($event, cue, 'start')"></span>
            <button
              v-if="wb.conflictIds.value.has(cue.id)"
              type="button"
              class="conflict-badge"
              title="时间重叠，点击定位相关字幕"
              @click.stop="wb.locateConflict(cue.id, partnerId(cue))"
            >冲突</button>
            <span class="cue-label"><b>#{{ cue.id }}</b> {{ cue.text.split('\n')[0] }}</span>
            <span class="edge edge-end" @pointerdown="blockPointerDown($event, cue, 'end')"></span>
          </div>
        </div>
        <div class="playhead" :style="{ left: px(wb.ui.playhead) + 'px' }">
          <span class="playhead-grip"></span>
        </div>
      </div>
    </div>
  </section>
</template>
