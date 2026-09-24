<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWorkbench } from '../stores/workbench';
import { formatClock } from '../lib/srt';

const wb = useWorkbench();
const fileInput = ref<HTMLInputElement | null>(null);

function openFile(): void {
  fileInput.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    wb.importText(text, file.name);
  } catch (error) {
    wb.ui.parseError = `读取文件失败：${(error as Error).message}`;
  } finally {
    input.value = '';
  }
}

function exportFile(): void {
  if (wb.state.cues.length === 0) {
    wb.ui.notice = '没有可导出的字幕。';
    wb.ui.noticeKind = 'error';
    return;
  }
  const blob = new Blob([wb.exportText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'calibrated.srt';
  anchor.click();
  URL.revokeObjectURL(url);
  wb.ui.notice = '已导出 SRT（按开始时间稳定排序并连续编号）。';
  wb.ui.noticeKind = 'success';
}

const shiftInput = ref('500');
type ShiftResultView = ReturnType<typeof wb.buildShiftPreview> | null;
const shiftPreview = ref<ShiftResultView>(null);
const shiftDeltaNumber = computed(() => Number(shiftInput.value));

function refreshPreview(): void {
  shiftPreview.value = wb.buildShiftPreview(Number(shiftInput.value));
}

function confirmShift(): void {
  if (!Number.isFinite(shiftDeltaNumber.value) || shiftDeltaNumber.value === 0) return;
  if (wb.confirmShift(shiftDeltaNumber.value)) {
    wb.ui.shiftOpen = false;
  } else {
    refreshPreview();
  }
}

function openShift(): void {
  refreshPreview();
  wb.ui.shiftOpen = true;
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="primary" @click="openFile">导入 SRT（UTF-8）</button>
    <input ref="fileInput" type="file" accept=".srt,text/plain" hidden @change="onFileChange" />
    <button type="button" @click="wb.loadSample()">载入示例</button>
    <button type="button" @click="exportFile">导出 SRT</button>
    <span class="sep"></span>
    <button type="button" :disabled="!wb.canUndo" @click="wb.undo()">撤销 Ctrl+Z</button>
    <button type="button" :disabled="!wb.canRedo" @click="wb.redo()">重做 Ctrl+Y</button>
    <span class="sep"></span>
    <button
      type="button"
      :disabled="wb.state.selected.length === 0"
      @click="openShift"
    >批量提前/延后（{{ wb.state.selected.length }}）</button>
    <div v-if="wb.ui.parseError" class="parse-error" role="alert">
      <p><b>{{ wb.ui.parseError }}</b></p>
      <ul>
        <li v-for="(issue, index) in wb.ui.parseIssues" :key="index">
          <template v-if="issue.cue != null">字幕 #{{ issue.cue }}：</template>{{ issue.reason }}
        </li>
      </ul>
      <button type="button" @click="wb.dismissParseError()">知道了</button>
    </div>
    <div v-if="wb.ui.shiftOpen" class="modal-backdrop" @click.self="wb.ui.shiftOpen = false">
      <div class="modal" role="dialog" aria-label="批量平移预览">
        <h3>批量提前/延后预览</h3>
        <p class="hint">将对已选中的 {{ wb.state.selected.length }} 条字幕统一平移，负值表示提前。</p>
        <label class="shift-input">平移毫秒
          <input v-model="shiftInput" type="number" step="100" @input="refreshPreview" @keydown.enter="confirmShift" />
        </label>
        <div v-if="shiftPreview" class="shift-preview">
          <p v-if="!shiftPreview.ok" class="error-text">{{ shiftPreview.reason }}</p>
          <template v-else>
            <p>共 {{ shiftPreview.changes.size }} 条将变化，确认前文档不会改动：</p>
            <ul>
              <li v-for="[id, change] in shiftPreview.changes" :key="id">
                #{{ id }}：{{ formatClock(change.from.start) }} → {{ formatClock(change.to.start) }}
              </li>
            </ul>
          </template>
        </div>
        <div class="modal-actions">
          <button type="button" class="primary" :disabled="!shiftPreview?.ok" @click="confirmShift">确认调整</button>
          <button type="button" @click="wb.ui.shiftOpen = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>
