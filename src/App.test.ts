import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from './App.vue';

describe('App', () => {
  it('载入示例后显示列表、时间轴和冲突', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    expect(wrapper.text()).toContain('载入示例');
    await wrapper.findAll('button').find((button) => button.text() === '载入示例')!.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('字幕列表（6）');
    expect(wrapper.text()).toContain('条冲突');
  });
});
