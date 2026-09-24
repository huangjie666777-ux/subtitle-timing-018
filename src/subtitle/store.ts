import { computed, ref } from 'vue';
import type { Cue } from './srt';
import { parseSrt, serializeSrt, SrtParseError } from './srt';
import { findConflicts } from './timeline';
import { applyShift, validateShift } from './timeline';
import { HistoryStack } from './history';
import { SAMPLE_SRT } from './sample';

interface DocSnapshot {
  cues: Cue[];
  selection: string[];
}

function cloneCues(cues: Cue[]): Cue[] {
  return cues.map((cue) => ({ ...cue, text: cue.text }));
}
const cues = ref<Cue[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const activeId = ref<string | null>(null);
const playhead = ref(0);
const importError = ref<string | null>(null);
const notice = ref<string | null>(null);

let history = new HistoryStack<DocSnapshot, string[]>({
  document: { cues: [], selection: [] },
  selection: [],
});

function takeSnapshot(): { document: DocSnapshot; selection: string[] } {
  return {
    document: { cues: cloneCues(cues.value), selection: [...selectedIds.value] },
    selection: [...selectedIds.value],
  };
}

function restore(snapshot: { document: DocSnapshot; selection: string[] }): void {
  cues.value = cloneCues(snapshot.document.cues);
  selectedIds.value = new Set(snapshot.document.selection);
  activeId.value = snapshot.document.selection[0] ?? null;
}

function commit(next: Cue[], selection?: Set<string>): void {
  history.commit({
    document: { cues: cloneCues(next), selection: [...(selection ?? selectedIds.value)] },
    selection: [...(selection ?? selectedIds.value)],
  });
  cues.value = next;
  if (selection) selectedIds.value = new Set(selection);
}

function loadDocument(next: Cue[]): void {
  history = new HistoryStack({ document: { cues: cloneCues(next), selection: [] }, selection: [] });
  cues.value = next;
  selectedIds.value = new Set();
  activeId.value = null;
  playhead.value = next[0]?.start ?? 0;
}

const orderedCues = computed(() => {
  const order = new Map(cues.value.map((cue, index) => [cue.id, index]));
  return [...cues.value].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
});

const conflictMap = computed(() => findConflicts(cues.value));
const activeCue = computed(() => cues.value.find((cue) => cue.id === activeId.value) ?? null);
const canUndo = computed(() => history.canUndo);
const canRedo = computed(() => history.canRedo);

function selectOnly(id: string): void {
  selectedIds.value = new Set([id]);
  activeId.value = id;
}

function toggleSelection(id: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
  activeId.value = id;
}

function undo(): void {
  if (!history.canUndo) return;
  restore(history.undo());
}

function redo(): void {
  if (!history.canRedo) return;
  restore(history.redo());
}

function updateCue(id: string, patch: Partial<Pick<Cue, 'start' | 'end' | 'text'>>): string | null {
  const cue = cues.value.find((item) => item.id === id);
  if (!cue) return '字幕不存在';
  const start = patch.start ?? cue.start;
  const end = patch.end ?? cue.end;
  const text = patch.text ?? cue.text;
  if (start < 0) return '开始时间不能为负';
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '时间必须是有效数字';
  if (start >= end) return '开始时间必须早于结束时间';
  if (!text.trim()) return '字幕文本不能为空';
  if (start === cue.start && end === cue.end && text === cue.text) return null;
  commit(cues.value.map((item) => (item.id === id ? { ...item, start, end, text } : item)));
  return null;
}

let dragSnapshot: { document: DocSnapshot; selection: string[] } | null = null;

function beginDrag(): void {
  dragSnapshot = takeSnapshot();
}

function liveDrag(updater: (cues: Cue[]) => Cue[]): void {
  cues.value = updater(cloneCues(cues.value));
}

function commitDrag(): void {
  if (!dragSnapshot) return;
  history.commit(takeSnapshot());
  dragSnapshot = null;
}

function cancelDrag(): void {
  if (dragSnapshot) restore(dragSnapshot);
  dragSnapshot = null;
}

const shiftPreview = ref<{ deltaMs: number; valid: boolean; reason?: string } | null>(null);

function openShiftPreview(deltaMs: number): void {
  const result = validateShift(cues.value, selectedIds.value, deltaMs);
  shiftPreview.value = { deltaMs, valid: result.ok, reason: result.reason };
}

function closeShiftPreview(): void {
  shiftPreview.value = null;
}

function confirmShift(): void {
  const preview = shiftPreview.value;
  if (!preview || !preview.valid) return;
  const result = validateShift(cues.value, selectedIds.value, preview.deltaMs);
  if (!result.ok) return;
  commit(applyShift(cues.value, selectedIds.value, preview.deltaMs));
  notice.value = `已将 ${selectedIds.value.size} 条字幕${
    preview.deltaMs > 0 ? '延后' : '提前'
  } ${Math.abs(preview.deltaMs)} 毫秒`;
  shiftPreview.value = null;
}

function nudge(deltaMs: number): void {
  const result = validateShift(cues.value, selectedIds.value, deltaMs);
  if (!result.ok) {
    notice.value = result.reason ?? '无法调整';
    return;
  }
  commit(applyShift(cues.value, selectedIds.value, deltaMs));
}

function importText(content: string): boolean {
  try {
    const parsed = parseSrt(content, `import-${Date.now()}`);
    loadDocument(parsed);
    importError.value = null;
    notice.value = `成功导入 ${parsed.length} 条字幕`;
    return true;
  } catch (error) {
    if (error instanceof SrtParseError) {
      importError.value = error.message;
    } else {
      importError.value = (error as Error).message;
    }
    return false;
  }
}

function loadSample(): void {
  loadDocument(parseSrt(SAMPLE_SRT, 'sample'));
  importError.value = null;
  notice.value = '已载入示例字幕';
}

function exportText(): string {
  return serializeSrt(cues.value);
}

export function useStore() {
  return {
    cues,
    orderedCues,
    selectedIds,
    activeId,
    activeCue,
    playhead,
    importError,
    notice,
    conflictMap,
    canUndo,
    canRedo,
    shiftPreview,
    selectOnly,
    toggleSelection,
    undo,
    redo,
    updateCue,
    beginDrag,
    liveDrag,
    commitDrag,
    cancelDrag,
    openShiftPreview,
    closeShiftPreview,
    confirmShift,
    nudge,
    importText,
    loadSample,
    exportText,
  };
}
