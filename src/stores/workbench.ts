import { computed, reactive, readonly } from 'vue';
import type { Cue } from '../lib/srt';
import { parseSrt, serializeSrt, SrtParseError } from '../lib/srt';
import {
  cuesAt,
  detectConflicts,
  previewShift,
  sortedCues,
  validateRange,
} from '../lib/timeline';
import { History } from '../lib/history';
import { sampleCues } from '../lib/sample';

interface DocState {
  cues: Cue[];
  selected: number[];
  activeId: number | null;
}

function cloneCues(cues: Cue[]): Cue[] {
  return cues.map((cue) => ({ ...cue, text: cue.text }));
}

function cloneState(state: DocState): DocState {
  return { cues: cloneCues(state.cues), selected: [...state.selected], activeId: state.activeId };
}

let nextSeq = 1000;

class WorkbenchStore {
  private history: History<DocState>;
  historyTick = 0;
  state = reactive({ cues: [] as Cue[], selected: [] as number[], activeId: null as number | null });
  ui = reactive({
    playhead: 0,
    playing: false,
    pxPerSec: 60,
    notice: '',
    noticeKind: 'info' as 'info' | 'error' | 'success',
    parseError: '',
    parseIssues: [] as { cue: number | null; reason: string }[],
    shiftDeltaMs: 500,
    shiftOpen: false,
  });

  constructor() {
    const initial: DocState = { cues: [], selected: [], activeId: null };
    this.history = new History(cloneState(initial));
  }

  private syncFromHistory(): void {
    const snap = this.history.value;
    this.state.cues = cloneCues(snap.cues);
    this.state.selected = [...snap.selected];
    this.state.activeId = snap.activeId;
  }

  canUndo = computed(() => {
    void this.historyTick;
    return this.history.canUndo;
  });

  canRedo = computed(() => {
    void this.historyTick;
    return this.history.canRedo;
  });

  readonly orderedCues = computed(() => sortedCues(this.state.cues));
  readonly conflicts = computed(() => detectConflicts(this.state.cues));
  readonly conflictIds = computed(() => new Set(this.conflicts.value.flatMap((c) => [c.a, c.b])));
  readonly activeCue = computed(() =>
    this.state.activeId == null ? null : this.state.cues.find((c) => c.id === this.state.activeId) ?? null,
  );
  readonly activeConflicts = computed(() =>
    this.state.activeId == null
      ? []
      : this.conflicts.value.filter((c) => c.a === this.state.activeId || c.b === this.state.activeId),
  );
  readonly previewCues = computed(() => cuesAt(this.state.cues, this.ui.playhead));

  private flash(message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
    this.ui.notice = message;
    this.ui.noticeKind = kind;
  }

  private commit(nextCues: Cue[]): void {
    this.history.commit({
      cues: cloneCues(nextCues),
      selected: [...this.state.selected],
      activeId: this.state.activeId,
    });
    this.syncFromHistory();
    this.historyTick += 1;
  }

  loadSample(): void {
    const cues = sampleCues();
    nextSeq = 1000 + cues.length;
    this.commitWith(cues, [], cues[0]?.id ?? null);
    this.ui.playhead = 0;
    this.flash('已载入示例，其中包含首尾相接与局部重叠。', 'success');
  }

  private commitWith(cues: Cue[], selected: number[], activeId: number | null): void {
    this.history.commit({ cues: cloneCues(cues), selected: [...selected], activeId });
    this.syncFromHistory();
    this.historyTick += 1;
  }

  importText(content: string, fileName: string): boolean {
    let parsed: Cue[];
    try {
      parsed = parseSrt(content);
    } catch (error) {
      if (error instanceof SrtParseError) {
        this.ui.parseIssues = error.issues.map((it) => ({ cue: it.cue, reason: it.reason }));
        this.ui.parseError = `导入 ${fileName} 失败，当前文档保持不变。${error.message}`;
        this.flash('解析失败，当前文档未被覆盖。', 'error');
      } else {
        this.ui.parseError = `导入 ${fileName} 失败：${(error as Error).message}`;
      }
      return false;
    }
    parsed.forEach((cue) => {
      if (cue.id >= nextSeq) nextSeq = cue.id + 1;
    });
    const activeId = sortedCues(parsed)[0]?.id ?? null;
    this.commitWith(parsed, activeId == null ? [] : [activeId], activeId);
    this.ui.parseError = '';
    this.ui.parseIssues = [];
    this.ui.playhead = 0;
    this.flash(`成功导入 ${parsed.length} 条字幕。`, 'success');
    return true;
  }

  dismissParseError(): void {
    this.ui.parseError = '';
    this.ui.parseIssues = [];
  }

  exportText(): string {
    return serializeSrt(this.state.cues);
  }

  selectCue(id: number, additive: boolean, range: boolean): void {
    const ordered = this.orderedCues.value;
    if (range && this.state.activeId != null) {
      const anchorIdx = ordered.findIndex((c) => c.id === this.state.activeId);
      const targetIdx = ordered.findIndex((c) => c.id === id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [lo, hi] = [Math.min(anchorIdx, targetIdx), Math.max(anchorIdx, targetIdx)];
        this.state.selected = ordered.slice(lo, hi + 1).map((c) => c.id);
        this.state.activeId = id;
        return;
      }
    }
    if (additive) {
      if (this.state.selected.includes(id)) {
        this.state.selected = this.state.selected.filter((item) => item !== id);
      } else {
        this.state.selected = [...this.state.selected, id];
      }
      this.state.activeId = id;
      return;
    }
    this.state.selected = [id];
    this.state.activeId = id;
  }

  selectOnly(id: number): void {
    if (this.state.activeId !== id || this.state.selected.length !== 1 || this.state.selected[0] !== id) {
      this.state.selected = [id];
      this.state.activeId = id;
    }
  }

  selectMany(ids: number[]): void {
    this.state.selected = [...ids];
    const first = ids[0] ?? null;
    if (first != null) this.state.activeId = first;
  }

  updateCue(id: number, patch: Partial<Pick<Cue, 'start' | 'end' | 'text'>>): string | null {
    const cue = this.state.cues.find((item) => item.id === id);
    if (!cue) return '字幕不存在';
    const start = patch.start ?? cue.start;
    const end = patch.end ?? cue.end;
    const text = (patch.text ?? cue.text).trim();
    if (text.length === 0) return '字幕文本不能为空';
    const rangeError = validateRange(start, end);
    if (rangeError) return rangeError;
    this.commit(
      this.state.cues.map((item) => (item.id === id ? { ...item, start, end, text } : item)),
    );
    return null;
  }

  beginDrag(): DocState {
    return cloneState({
      cues: this.state.cues,
      selected: this.state.selected,
      activeId: this.state.activeId,
    });
  }

  previewDrag(base: DocState, dragIds: number[], deltaMs: number, edge?: 'start' | 'end' | null): string | null {
    const set = new Set(dragIds);
    let error: string | null = null;
    const next = base.cues.map((cue) => {
      if (!set.has(cue.id)) return { ...cue };
      let { start, end } = cue;
      if (edge === 'start') start = cue.start + deltaMs;
      else if (edge === 'end') end = cue.end + deltaMs;
      else {
        start = cue.start + deltaMs;
        end = cue.end + deltaMs;
      }
      start = Math.max(0, start);
      if (start >= end) {
        error = error ?? `字幕 #${cue.id} 调整后开始必须早于结束，已限制到边界`;
        if (edge === 'start') start = end - 1;
        if (edge === 'end') end = start + 1;
      }
      return { ...cue, start, end };
    });
    this.state.cues = next;
    return error;
  }

  commitDrag(base: DocState): void {
    this.history.commitFrom(cloneState(base), {
      cues: cloneCues(this.state.cues),
      selected: [...base.selected],
      activeId: base.activeId,
    });
    this.syncFromHistory();
    this.historyTick += 1;
  }

  cancelDrag(base: DocState): void {
    this.state.cues = cloneCues(base.cues);
  }

  buildShiftPreview(deltaMs: number): { ok: boolean; reason?: string; changes: Map<number, { from: Cue; to: Cue }> } {
    const result = previewShift(this.state.cues, this.state.selected, deltaMs);
    const changes = new Map<number, { from: Cue; to: Cue }>();
    if (result.ok && result.next) {
      result.next.forEach((to, index) => {
        const from = this.state.cues[index];
        if (to.start !== from.start || to.end !== from.end) changes.set(to.id, { from, to });
      });
    }
    return { ok: result.ok, reason: result.reason, changes };
  }

  confirmShift(deltaMs: number): boolean {
    const result = previewShift(this.state.cues, this.state.selected, deltaMs);
    if (!result.ok || !result.next) {
      this.flash(result.reason ?? '批量调整被拒绝。', 'error');
      return false;
    }
    this.commit(result.next);
    this.flash(`已将 ${this.state.selected.length} 条字幕统一平移 ${deltaMs} 毫秒。`, 'success');
    return true;
  }

  undo(): void {
    if (!this.history.canUndo) return;
    this.history.undo();
    this.syncFromHistory();
    this.historyTick += 1;
    this.flash('已撤销上一步。');
  }

  redo(): void {
    if (!this.history.canRedo) return;
    this.history.redo();
    this.syncFromHistory();
    this.historyTick += 1;
    this.flash('已重做。');
  }

  setPlayhead(ms: number): void {
    this.ui.playhead = Math.max(0, Math.round(ms));
  }

  locateConflict(a: number, b: number): void {
    this.selectMany([a, b]);
  }
}

export const workbench = new WorkbenchStore();
export function useWorkbench(): typeof workbench {
  return workbench;
}
export { readonly };
