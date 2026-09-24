<template>
  <main class="app" @keydown="onKeydown" tabindex="0">
    <header class="topbar">
      <h1>字幕时间轴校准工作台</h1>
      <div class="actions">
        <label class="file-btn">导入 SRT
          <input type="file" accept=".srt,text/plain" @change="onFileChange" />
        </label>
        <button type="button" @click="store.loadSample()">载入示例</button>
        <button type="button" :disabled="!store.canUndo.value" @click="store.undo()">撤销</button>
        <button type="button" :disabled="!store.canRedo.value" @click="store.redo()">重做</button>
        <button type="button" :disabled="!orderedCues.length" @click="downloadSrt">导出 SRT</button>
      </div>
    </header>

    <section v-if="store.importError.value" class="banner error">{{ store.importError.value }}</section>
    <section v-if="store.notice.value" class="banner notice" @click="store.notice.value = null">
      {{ store.notice.value }}（点击关闭）
    </section>

    <section class="playback-bar">
      <button type="button" @click="togglePlay">{{ playing ? '暂停' : '播放' }}</button>
      <button type="button" @click="store.playhead.value = Math.max(0, store.playhead.value - 1000)">-1秒</button>
      <button type="button" @click="store.playhead.value += 1000">+1秒</button>
      <span>播放头：<strong>{{ formatTimecode(store.playhead.value) }}</strong></span>
      <span class="muted" v-if="!currentCues.length">当前时刻无字幕</span>
      <div v-else class="current-previews">
        <article v-for="cue in currentCues" :key="cue.id" class="current-cue" :class="{ conflict: store.conflictMap.value.has(cue.id) }">
          <span>{{ formatTimecode(cue.start) }} - {{ formatTimecode(cue.end) }}</span>
          <p>{{ cue.text }}</p>
        </article>
      </div>
    </section>

    <section class="batch-bar" v-if="orderedCues.length">
      <span>已选 {{ selectedIds.size }} 条</span>
      <button type="button" :disabled="!selectedIds.size" @click="store.openShiftPreview(-500)">批量提前0.5秒</button>
      <button type="button" :disabled="!selectedIds.size" @click="store.openShiftPreview(500)">批量延后0.5秒</button>
      <button type="button" :disabled="!selectedIds.size" @click="openCustom">自定义毫秒…</button>
      <span class="hint">单击选择；Ctrl/⌘+单击多选。方向键 10ms，Shift+方向键 100ms。</span>
    </section>

    <div v-if="store.shiftPreview.value" class="modal-backdrop" @click.self="store.closeShiftPreview()">
      <div class="modal">
        <h2>批量调整预览</h2>
        <p v-if="!customShift">{{ store.shiftPreview.value.deltaMs > 0 ? '延后' : '提前' }} {{ Math.abs(store.shiftPreview.value.deltaMs) }} 毫秒</p>
        <label v-else>调整毫秒数（负为提前）<input v-model.number="customDelta" type="number" step="1" @input="refreshCustom" /></label>
        <table class="preview-table">
          <thead><tr><th>序号</th><th>原开始</th><th>新开始</th><th>文本</th></tr></thead>
          <tbody>
            <tr v-for="(cue, index) in previewRows" :key="cue.id" :class="{ invalid: cue.start + previewDelta < 0 }">
              <td>{{ index + 1 }}</td>
              <td>{{ formatTimecode(cue.start) }}</td>
              <td>{{ cue.start + previewDelta >= 0 ? formatTimecode(cue.start + previewDelta) : '越界' }}</td>
              <td>{{ cue.text.split('\n')[0] }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!store.shiftPreview.value.valid" class="error">{{ store.shiftPreview.value.reason }}，当前文档保持不变。</p>
        <div class="modal-actions">
          <button type="button" :disabled="!store.shiftPreview.value.valid" @click="store.confirmShift()">确认</button>
          <button type="button" @click="store.closeShiftPreview(); customShift = false">取消</button>
        </div>
      </div>
    </div>

    <div class="workspace" v-if="orderedCues.length">
      <CueList />
      <main class="center">
        <TimelineView />
        <CueEditor />
      </main>
    </div>
    <section v-else class="empty-state">
      <p>请导入 UTF-8 编码的 SRT 文件，或载入示例开始校准。</p>
      <button type="button" @click="store.loadSample()">载入示例</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import CueList from './components/CueList.vue';
import CueEditor from './components/CueEditor.vue';
import TimelineView from './components/TimelineView.vue';
import { formatTimecode } from './subtitle/srt';
import { cuesAt } from './subtitle/timeline';
import { useStore } from './subtitle/store';

const store = useStore();
const orderedCues = store.orderedCues;
const selectedIds = store.selectedIds;
const customShift = ref(false);
const customDelta = ref(0);

const previewDelta = computed(() =>
  customShift.value ? customDelta.value : store.shiftPreview.value?.deltaMs ?? 0,
);

const previewRows = computed(() =>
  orderedCues.value.filter((cue) => selectedIds.value.has(cue.id)),
);

watch(
  () => store.shiftPreview.value,
  (preview) => {
    if (preview) customDelta.value = preview.deltaMs;
    else customShift.value = false;
  },
);

function refreshCustom(): void {
  store.openShiftPreview(customDelta.value);
}

function openCustom(): void {
  customShift.value = true;
  store.openShiftPreview(100);
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  store.importText(decoded);
  input.value = '';
}

function downloadSrt(): void {
  const blob = new Blob([store.exportText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'calibrated.srt';
  anchor.click();
  URL.revokeObjectURL(url);
}

const currentCues = computed(() => cuesAt(orderedCues.value, store.playhead.value));

const playing = ref(false);
let lastTick = 0;
let rafId = 0;
function loop(time: number): void {
  if (!playing.value) return;
  if (lastTick) store.playhead.value += time - lastTick;
  lastTick = time;
  rafId = requestAnimationFrame(loop);
}
function togglePlay(): void {
  playing.value = !playing.value;
  lastTick = 0;
  if (playing.value) rafId = requestAnimationFrame(loop);
  else cancelAnimationFrame(rafId);
}
onUnmounted(() => cancelAnimationFrame(rafId));

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
  if (event.key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    event.preventDefault();
    store.undo();
  } else if (
    (event.key === 'y' && (event.ctrlKey || event.metaKey)) ||
    (event.key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey)
  ) {
    event.preventDefault();
    store.redo();
  } else if (event.key.startsWith('Arrow')) {
    const base = event.shiftKey ? 100 : 10;
    const map: Record<string, number> = {
      ArrowLeft: -base,
      ArrowRight: base,
    };
    const delta = map[event.key];
    if (delta && selectedIds.value.size) {
      event.preventDefault();
      store.nudge(delta);
    }
  }
}
</script>
