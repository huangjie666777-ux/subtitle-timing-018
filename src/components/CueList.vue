<template>
  <section class="cue-list-panel">
    <h2>字幕列表（{{ orderedCues.length }}）</h2>
    <ul class="cue-list">
      <li
        v-for="(cue, index) in orderedCues"
        :key="cue.id"
        :ref="(el) => setRowRef(cue.id, el as HTMLElement | null)"
        class="cue-row"
        :class="{
          active: cue.id === activeId,
          selected: selectedIds.has(cue.id),
          conflict: conflictMap.has(cue.id),
        }"
        @click="select(cue.id)"
        @click.ctrl.prevent="store.toggleSelection(cue.id)"
        @click.meta.prevent="store.toggleSelection(cue.id)"
      >
        <span class="cue-index">{{ index + 1 }}</span>
        <span class="cue-time">
          {{ formatTimecode(cue.start) }} → {{ formatTimecode(cue.end) }}
          <em>{{ cue.end - cue.start }} ms</em>
        </span>
        <span class="cue-text">{{ cue.text }}</span>
        <button v-if="conflictMap.has(cue.id)" type="button" class="mini danger" @click.stop="locateConflict(cue.id)">
          {{ conflictMap.get(cue.id)!.cueIds.size }} 条冲突
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { formatTimecode } from '../subtitle/srt';
import { useStore } from '../subtitle/store';

const store = useStore();
const { orderedCues, selectedIds, activeId, conflictMap } = store;

const rowRefs = new Map<string, HTMLElement>();
function setRowRef(id: string, el: HTMLElement | null): void {
  if (el) rowRefs.set(id, el);
  else rowRefs.delete(id);
}

watch(activeId, async (id) => {
  if (!id) return;
  await nextTick();
  rowRefs.get(id)?.scrollIntoView({ block: 'nearest' });
});

function select(id: string): void {
  store.selectOnly(id);
  store.playhead.value = store.cues.value.find((cue) => cue.id === id)?.start ?? store.playhead.value;
}

function locateConflict(id: string): void {
  const group = conflictMap.value.get(id);
  if (!group) return;
  store.selectedIds.value = new Set(group.cueIds);
  store.activeId.value = id;
  const cue = store.orderedCues.value.find((item) => item.id === id);
  if (cue) store.playhead.value = cue.start;
}
</script>
