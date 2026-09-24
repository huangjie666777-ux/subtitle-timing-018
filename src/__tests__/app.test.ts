import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import App from '../App.vue';
import { useWorkbench } from '../stores/workbench';

describe('App', () => {
  it('loads sample and renders linked list and timeline blocks', () => {
    const wb = useWorkbench();
    wb.loadSample();
    const wrapper = mount(App);
    expect(wrapper.text()).toContain('字幕时间轴校准工作台');
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    expect(wrapper.findAll('.cue-block')).toHaveLength(5);
    expect(wrapper.findAll('.conflict-badge').length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('#2 与 #3 重叠');
  });

  it('selecting a list row syncs timeline and inspector', async () => {
    const wb = useWorkbench();
    wb.loadSample();
    const wrapper = mount(App);
    const rows = wrapper.findAll('tbody tr');
    await rows[2].trigger('mousedown');
    expect(wb.state.activeId).toBe(3);
    expect(wrapper.findAll('.cue-block.selected')).toHaveLength(1);
    expect((wrapper.find('.inspector textarea').element as HTMLTextAreaElement).value).toContain(
      '故意重叠',
    );
  });
});
