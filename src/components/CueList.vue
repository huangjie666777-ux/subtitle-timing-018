<script setup lang="ts">
import { computed } from 'vue';
import { useWorkbench } from '../stores/workbench';
import { formatClock } from '../lib/srt';

const wb = useWorkbench();
const cues = computed(() => wb.orderedCues.value);

function rowClass(id: number): Record<string, boolean> {
  return {
    selected: wb.state.selected.includes(id),
    conflict: wb.conflictIds.value.has(id),
    active: wb.state.activeId === id,
    'on-air': wb.previewCues.value.some((cue) => cue.id === id),
  };
}

function onMouseDown(event: MouseEvent, id: number): void {
  wb.selectCue(id, event.ctrlKey || event.metaKey, event.shiftKey);
}
</script>

<template>
  <section class="panel cue-list" aria-label="字幕列表">
    <header class="panel-head">
      <h2>字幕列表</h2>
      <span class="hint">按开始时间排序 · Ctrl/Shift 多选</span>
    </header>
    <div class="list-scroll">
      <table>
        <thead>
          <tr><th>#</th><th>开始</th><th>结束</th><th>时长</th><th>文本</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="(cue, index) in cues"
            :key="cue.id"
            :class="rowClass(cue.id)"
            @mousedown="onMouseDown($event, cue.id)"
          >
            <td class="seq-cell">
              <span class="seq">{{ index + 1 }}</span>
              <span v-if="wb.conflictIds.value.has(cue.id)" class="conflict-dot" title="存在时间重叠"></span>
            </td>
            <td class="mono">{{ formatClock(cue.start) }}</td>
            <td class="mono">{{ formatClock(cue.end) }}</td>
            <td class="mono dur">{{ cue.end - cue.start }}ms</td>
            <td class="text-cell"><pre>{{ cue.text }}</pre></td>
          </tr>
        </tbody>
      </table>
      <p v-if="cues.length === 0" class="empty">暂无字幕，请导入 SRT 或载入示例。</p>
    </div>
  </section>
</template>
