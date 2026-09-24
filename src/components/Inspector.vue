<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useWorkbench } from '../stores/workbench';
import { formatClock, parseTimestamp } from '../lib/srt';

const wb = useWorkbench();
const cue = computed(() => wb.activeCue.value);

const startText = ref('');
const endText = ref('');
const textDraft = ref('');
const fieldError = ref('');
const savedFlash = ref(false);

watch(
  cue,
  (value) => {
    if (value) {
      startText.value = formatClock(value.start);
      endText.value = formatClock(value.end);
      textDraft.value = value.text;
      fieldError.value = '';
    }
  },
  { immediate: true },
);

function applyChanges(): void {
  if (!cue.value) return;
  let start: number;
  let end: number;
  try {
    start = parseTimestamp(startText.value);
    end = parseTimestamp(endText.value);
  } catch (error) {
    fieldError.value = (error as Error).message;
    return;
  }
  const error = wb.updateCue(cue.value.id, { start, end, text: textDraft.value });
  if (error) {
    fieldError.value = error;
    return;
  }
  fieldError.value = '';
  savedFlash.value = true;
  window.setTimeout(() => {
    savedFlash.value = false;
  }, 900);
}

function revertDraft(): void {
  if (!cue.value) return;
  startText.value = formatClock(cue.value.start);
  endText.value = formatClock(cue.value.end);
  textDraft.value = cue.value.text;
  fieldError.value = '';
}

function nudge(field: 'start' | 'end', delta: number): void {
  if (!cue.value) return;
  try {
    const value = (field === 'start' ? parseTimestamp(startText.value) : parseTimestamp(endText.value)) + delta;
    const formatted = formatClock(Math.max(0, value));
    if (field === 'start') startText.value = formatted;
    else endText.value = formatted;
  } catch {
    /* ignore invalid draft */
  }
}

const conflictPartners = computed(() => wb.activeConflicts.value);
</script>

<template>
  <section class="panel inspector" aria-label="字幕检查器">
    <header class="panel-head"><h2>检查器</h2></header>
    <div v-if="!cue" class="empty">选择一条字幕后可在此精确编辑文本与起止时间。</div>
    <div v-else class="inspector-body">
      <div class="field-row">
        <label>开始
          <input v-model="startText" spellcheck="false" @keydown.enter="applyChanges" />
          <span class="steppers"><button type="button" @click="nudge('start', -1)">-1ms</button><button type="button" @click="nudge('start', 1)">+1ms</button></span>
        </label>
        <label>结束
          <input v-model="endText" spellcheck="false" @keydown.enter="applyChanges" />
          <span class="steppers"><button type="button" @click="nudge('end', -1)">-1ms</button><button type="button" @click="nudge('end', 1)">+1ms</button></span>
        </label>
      </div>
      <div class="readouts">
        <span>时长 <b>{{ cue.end - cue.start }}</b> ms</span>
        <span>原始编号 #{{ cue.id }}</span>
      </div>
      <label class="text-label">文本（保留多行，Enter 换行）
        <textarea v-model="textDraft" rows="5" spellcheck="false"></textarea>
      </label>
      <p v-if="fieldError" class="error-text">{{ fieldError }}</p>
      <div v-if="conflictPartners.length" class="conflict-box">
        <strong>时间重叠：</strong>
        <button
          v-for="c in conflictPartners"
          :key="c.a === cue.id ? c.b : c.a"
          type="button"
          class="link-btn"
          @click="wb.locateConflict(c.a, c.b)"
        >定位 #{{ c.a === cue.id ? c.b : c.a }}</button>
      </div>
      <div class="actions">
        <button type="button" class="primary" @click="applyChanges">确认修改</button>
        <button type="button" @click="revertDraft">还原草稿</button>
        <span v-if="savedFlash" class="saved">已保存</span>
      </div>
      <p class="hint">输入框中的未确认修改不会影响已保存结果；Enter 或点击“确认修改”后才写入。</p>
    </div>
  </section>
</template>
