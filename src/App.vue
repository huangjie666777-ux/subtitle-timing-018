<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import Toolbar from './components/Toolbar.vue';
import CueList from './components/CueList.vue';
import Timeline from './components/Timeline.vue';
import Inspector from './components/Inspector.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import { useWorkbench } from './stores/workbench';

const wb = useWorkbench();

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (typing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    wb.undo();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    wb.redo();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="app">
    <header class="app-head">
      <h1>字幕时间轴校准工作台</h1>
      <p class="subtitle">解决整段字幕提前、局部重叠与修改难以回退的问题</p>
    </header>
    <Toolbar />
    <transition name="fade">
      <div v-if="wb.ui.notice" class="notice" :class="wb.ui.noticeKind">{{ wb.ui.notice }}</div>
    </transition>
    <main class="workspace">
      <div class="left-col">
        <CueList />
        <PreviewPanel />
      </div>
      <div class="right-col">
        <Timeline />
        <Inspector />
      </div>
    </main>
  </div>
</template>
