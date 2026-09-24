<template>
  <section class="editor-panel">
    <h2>精确编辑</h2>
    <p v-if="!activeCue" class="muted">在列表或时间轴中选择一条字幕进行编辑。</p>
    <form v-else class="editor-form" @submit.prevent="save">
      <label>开始（HH:MM:SS,mmm）
        <input v-model="startText" @keydown.down.prevent="adjustField('start', -100)" @keydown.up.prevent="adjustField('start', 100)" />
      </label>
      <label>结束
        <input v-model="endText" @keydown.down.prevent="adjustField('end', -100)" @keydown.up.prevent="adjustField('end', 100)" />
      </label>
      <p class="duration">时长：{{ duration }} ms</p>
      <label>文本（多行保留）
        <textarea v-model="textValue" rows="4"></textarea>
      </label>
      <div class="editor-actions">
        <button type="submit" :disabled="!dirty">保存</button>
        <button type="button" @click="reset">重置</button>
        <button type="button" @click="store.nudge(-100)">↑提前0.1秒</button>
        <button type="button" @click="store.nudge(100)">↓延后0.1秒</button>
      </div>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p class="hint">选中多条时，方向键以 10ms（Shift 为 100ms）整体平移。</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatTimecode, parseTimecode } from '../subtitle/srt';
import { useStore } from '../subtitle/store';

const store = useStore();
const { activeCue } = store;
const startText = ref('');
const endText = ref('');
const textValue = ref('');
const errorMessage = ref('');

function reset(): void {
  if (!activeCue.value) return;
  startText.value = formatTimecode(activeCue.value.start);
  endText.value = formatTimecode(activeCue.value.end);
  textValue.value = activeCue.value.text;
  errorMessage.value = '';
}

watch(activeCue, reset, { immediate: true });

const duration = computed(() => {
  try {
    const { start, end } = parseTimecode(`${startText.value} --> ${endText.value}`);
    return end - start;
  } catch {
    return '—';
  }
});

const dirty = computed(() => {
  if (!activeCue.value) return false;
  return (
    startText.value !== formatTimecode(activeCue.value.start) ||
    endText.value !== formatTimecode(activeCue.value.end) ||
    textValue.value !== activeCue.value.text
  );
});

function save(): void {
  if (!activeCue.value) return;
  try {
    const timing = parseTimecode(`${startText.value} --> ${endText.value}`);
    const error = store.updateCue(activeCue.value.id, {
      start: timing.start,
      end: timing.end,
      text: textValue.value,
    });
    if (error) {
      errorMessage.value = error;
    } else {
      errorMessage.value = '';
    }
  } catch (error) {
    errorMessage.value = (error as Error).message;
  }
}

function adjustField(field: 'start' | 'end', delta: number): void {
  try {
    const timing = parseTimecode(`${startText.value} --> ${endText.value}`);
    const next = timing[field] + delta;
    if (field === 'start') startText.value = formatTimecode(Math.max(0, next));
    else endText.value = formatTimecode(Math.max(next, timing.start + 1));
  } catch {
    errorMessage.value = '当前时间码无法解析';
  }
}
</script>
