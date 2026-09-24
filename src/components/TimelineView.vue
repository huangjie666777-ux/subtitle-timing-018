<template>
  <section class="timeline-panel">
    <div class="timeline-toolbar">
      <label>缩放</label>
      <input v-model.number="pxPerSec" type="range" min="12" max="320" step="2" />
      <span>{{ pxPerSec }} px/秒</span>
      <button type="button" @click="jumpTo(activeId)">定位选中</button>
      <span class="hint">拖动块移动，拖两端改时长；单击标尺移动播放头</span>
    </div>
    <div ref="scrollerRef" class="timeline-scroll" @pointerdown="onScrollerPointerDown">
      <div ref="innerRef" class="timeline-inner" :style="{ width: `${innerWidth}px`, height: `${60 + laneCount * 38}px` }">
        <div class="ruler" :style="{ width: `${innerWidth}px` }">
          <span
            v-for="tick in ticks"
            :key="tick.ms"
            class="tick"
            :style="{ left: `${tick.ms * pxPerMs}px` }"
          >{{ formatTick(tick.ms) }}</span>
        </div>
        <div
          v-for="cue in orderedCues"
          :key="cue.id"
          class="cue-block"
          :class="{
            active: cue.id === activeId,
            selected: selectedIds.has(cue.id),
            conflict: conflictMap.has(cue.id),
            current: isCurrent(cue),
          }"
          :style="blockStyle(cue.id, cue.start, cue.end)"
          @pointerdown.stop="onBlockPointerDown($event, cue.id)"
          @dblclick.stop="onBlockDblClick(cue.id)"
        >
          <span class="resize-handle start" @pointerdown.stop="onHandleDown($event, cue.id, 'start')"></span>
          <span class="block-text">{{ firstLine(cue.text) }}</span>
          <span class="resize-handle end" @pointerdown.stop="onHandleDown($event, cue.id, 'end')"></span>
        </div>
        <div class="playhead" :style="{ left: `${playhead * pxPerMs}px` }"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatTimecode } from '../subtitle/srt';
import { assignLanes, cuesAt } from '../subtitle/timeline';
import { useStore } from '../subtitle/store';

const store = useStore();
const { orderedCues, selectedIds, activeId, playhead, conflictMap } = store;

const pxPerSec = ref(80);
const pxPerMs = computed(() => pxPerSec.value / 1000);
const scrollerRef = ref<HTMLElement | null>(null);
const innerRef = ref<HTMLElement | null>(null);

const laneMap = computed(() => assignLanes(orderedCues.value));
const laneCount = computed(() => {
  let max = 0;
  laneMap.value.forEach((lane) => {
    max = Math.max(max, lane + 1);
  });
  return Math.max(max, 1);
});

const maxMs = computed(() => {
  const end = orderedCues.value.reduce((max, cue) => Math.max(max, cue.end), 0);
  return Math.max(end + 5000, 15000);
});

const innerWidth = computed(() => Math.max(maxMs.value * pxPerMs.value + 80, 600));

const ticks = computed(() => {
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
  const interval = candidates.find((ms) => ms * pxPerMs.value >= 90) ?? 600000;
  const result: { ms: number }[] = [];
  for (let ms = 0; ms <= maxMs.value; ms += interval) result.push({ ms });
  return result;
});

function formatTick(ms: number): string {
  const totalSeconds = ms / 1000;
  if (ms % 60000 === 0) {
    const m = Math.floor(totalSeconds / 60);
    return `${m}:00`;
  }
  return `${totalSeconds.toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

function blockStyle(id: string, start: number, end: number) {
  const lane = laneMap.value.get(id) ?? 0;
  return {
    left: `${start * pxPerMs.value}px`,
    width: `${Math.max((end - start) * pxPerMs.value, 10)}px`,
    top: `${44 + lane * 38}px`,
  };
}

function firstLine(text: string): string {
  return text.split('\n')[0];
}

function isCurrent(cue: { start: number; end: number }): boolean {
  return playhead.value >= cue.start && playhead.value < cue.end;
}

interface DragState {
  mode: 'move' | 'resize-start' | 'resize-end';
  startX: number;
  moved: boolean;
  ids: Set<string>;
  originals: Map<string, { start: number; end: number }>;
}

let drag: DragState | null = null;

function pointerMove(event: PointerEvent): void {
  if (!drag) return;
  const state = drag;
  const dx = event.clientX - state.startX;
  if (Math.abs(dx) > 3) state.moved = true;
  const deltaMs = Math.round(dx / pxPerMs.value);
  store.liveDrag((cues) =>
    cues.map((cue) => {
      if (!state.ids.has(cue.id)) return cue;
      const original = state.originals.get(cue.id)!;
      if (state.mode === 'move') {
        const minStart = Math.min(...[...state.originals.values()].map((v) => v.start));
        const clamped = Math.max(deltaMs, -minStart);
        return { ...cue, start: original.start + clamped, end: original.end + clamped };
      }
      if (state.mode === 'resize-start') {
        const next = Math.min(original.start + deltaMs, original.end - 1);
        return { ...cue, start: Math.max(0, next) };
      }
      return { ...cue, end: Math.max(original.end + deltaMs, original.start + 1) };
    }),
  );
}

function pointerUp(): void {
  if (!drag) return;
  if (drag.moved) {
    store.commitDrag();
  } else {
    store.cancelDrag();
  }
  drag = null;
  window.removeEventListener('pointermove', pointerMove);
  window.removeEventListener('pointerup', pointerUp);
}

function startDrag(event: PointerEvent, ids: Set<string>, mode: DragState['mode']): void {
  const originals = new Map<string, { start: number; end: number }>();
  store.cues.value.forEach((cue) => {
    if (ids.has(cue.id)) originals.set(cue.id, { start: cue.start, end: cue.end });
  });
  drag = { mode, startX: event.clientX, moved: false, ids, originals };
  store.beginDrag();
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
}

function onBlockPointerDown(event: PointerEvent, id: string): void {
  if (event.ctrlKey || event.metaKey) {
    store.toggleSelection(id);
    return;
  }
  if (!selectedIds.value.has(id)) store.selectOnly(id);
  const ids = selectedIds.value.has(id) ? new Set(selectedIds.value) : new Set([id]);
  startDrag(event, ids, 'move');
}

function onHandleDown(event: PointerEvent, id: string, edge: 'start' | 'end'):
void {
  if (!selectedIds.value.has(id)) store.selectOnly(id);
  startDrag(event, new Set([id]), edge === 'start' ? 'resize-start' : 'resize-end');
}

function onScrollerPointerDown(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('.cue-block')) return;
  const inner = innerRef.value;
  if (!inner) return;
  const rect = inner.getBoundingClientRect();
  playhead.value = Math.max(0, Math.round((event.clientX - rect.left) / pxPerMs.value));
}

function onBlockDblClick(id: string): void {
  const group = conflictMap.value.get(id);
  if (!group) return;
  selectedIds.value = new Set(group.cueIds);
  activeId.value = id;
}

watch(activeId, (id) => {
  if (!id) return;
  const cue = orderedCues.value.find((item) => item.id === id);
  const scroller = scrollerRef.value;
  if (!cue || !scroller) return;
  const viewLeft = scroller.scrollLeft;
  const viewRight = viewLeft + scroller.clientWidth - 100;
  const blockLeft = cue.start * pxPerMs.value;
  const blockRight = cue.end * pxPerMs.value;
  if (blockLeft < viewLeft || blockRight > viewRight) {
    scroller.scrollTo({ left: Math.max(0, blockLeft - 120), behavior: 'smooth' });
  }
});

function jumpTo(id: string | null): void {
  if (!id) return;
  const cue = orderedCues.value.find((item) => item.id === id);
  if (!cue) return;
  scrollerRef.value?.scrollTo({ left: cue.start * pxPerMs.value - 120, behavior: 'smooth' });
}

defineExpose({ cuesAt, formatTimecode });
</script>
