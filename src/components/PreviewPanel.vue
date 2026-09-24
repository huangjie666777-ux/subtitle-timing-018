<script setup lang="ts">
import { computed } from 'vue';
import { useWorkbench } from '../stores/workbench';
import { formatClock } from '../lib/srt';

const wb = useWorkbench();
const conflicts = computed(() => wb.conflicts.value);
</script>

<template>
  <section class="panel preview" aria-label="播放头与冲突">
    <header class="panel-head"><h2>播放头预览</h2></header>
    <p class="mono current-time">当前时刻 {{ formatClock(wb.ui.playhead) }}（含开始、不含结束）</p>
    <div v-if="wb.previewCues.value.length === 0" class="empty muted">当前时刻没有有效字幕。</div>
    <article v-for="cue in wb.previewCues.value" :key="cue.id" class="preview-cue">
      <header><b>#{{ cue.id }}</b><span class="mono">{{ formatClock(cue.start) }} – {{ formatClock(cue.end) }}</span></header>
      <pre @click="wb.selectOnly(cue.id)">{{ cue.text }}</pre>
    </article>
    <div class="conflicts-summary">
      <h3>冲突列表（{{ conflicts.length }}）</h3>
      <p v-if="conflicts.length === 0" class="hint">没有重叠；首尾相接不算冲突。</p>
      <ul v-else>
        <li v-for="c in conflicts" :key="c.a + '-' + c.b">
          <button type="button" class="link-btn" @click="wb.locateConflict(c.a, c.b)">#{{ c.a }} 与 #{{ c.b }} 重叠</button>
        </li>
      </ul>
    </div>
  </section>
</template>
