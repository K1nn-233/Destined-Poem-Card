<script setup lang="ts">
// 级联选项节点类型
import type { CascaderOption } from '../../types/cascader';
export type { CascaderOption } from '../../types/cascader';

interface Props {
  options: CascaderOption[];
  modelValue: string;
  expandedNodes: Set<string>;
  depth: number;
}

interface Emits {
  (e: 'toggle', value: string): void;
  (e: 'select', value: string, hasChildren: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
});

const emit = defineEmits<Emits>();

// 检查是否有子节点
const hasChildren = (option: CascaderOption): boolean => {
  return !!(option.children && option.children.length > 0);
};

// 检查节点是否展开
const isExpanded = (option: CascaderOption): boolean => {
  return props.expandedNodes.has(option.value);
};

// 检查节点是否被选中（只有叶子节点可以被选中高亮）
const isSelected = (option: CascaderOption): boolean => {
  return !hasChildren(option) && option.value === props.modelValue;
};

// 处理展开/收起
const handleToggle = (option: CascaderOption, event: Event) => {
  event.stopPropagation();
  emit('toggle', option.value);
};

// 处理选择
const handleSelect = (option: CascaderOption, event: Event) => {
  event.stopPropagation();
  emit('select', option.value, hasChildren(option));
};

// 向上传递子节点事件
const handleChildToggle = (value: string) => {
  emit('toggle', value);
};

const handleChildSelect = (value: string, hasChild: boolean) => {
  emit('select', value, hasChild);
};
</script>

<template>
  <div class="tree-level" :style="{ paddingLeft: depth > 0 ? '16px' : '0' }">
    <div v-for="option in options" :key="option.value" class="tree-node">
      <div
        class="node-content"
        :class="{
          'is-selected': isSelected(option),
          'is-disabled': option.disabled,
          'has-children': hasChildren(option),
        }"
        @click="handleSelect(option, $event)"
      >
        <span
          v-if="hasChildren(option)"
          class="expand-icon"
          :class="{ expanded: isExpanded(option) }"
          @click="handleToggle(option, $event)"
        >
          ▶
        </span>
        <span v-else class="expand-icon placeholder"></span>
        <span class="node-label">{{ option.label }}</span>
      </div>

      <div v-if="hasChildren(option) && isExpanded(option)" class="node-children">
        <!-- 递归调用自身 -->
        <CascaderTreeNode
          :options="option.children!"
          :model-value="modelValue"
          :expanded-nodes="expandedNodes"
          :depth="depth + 1"
          @toggle="handleChildToggle"
          @select="handleChildSelect"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tree-level {
  .tree-node {
    .node-content {
      display: flex;
      align-items: center;
      padding: var(--spacing-xs) var(--spacing-sm);
      cursor: pointer;
      transition: background-color var(--transition-fast);
      border-radius: var(--radius-sm);
      margin: 2px var(--spacing-xs);

      &:hover:not(.is-disabled) {
        background: var(--hover-bg, rgba(212, 175, 55, 0.1));
      }

      &.is-selected {
        background: rgba(212, 175, 55, 0.15);
        color: var(--accent-color);
        font-weight: 600;
      }

      &.is-disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &.has-children {
        font-weight: 500;
      }
    }

    .expand-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      color: var(--text-light);
      transition: transform var(--transition-normal);
      flex-shrink: 0;

      &.expanded {
        transform: rotate(90deg);
      }

      &.placeholder {
        visibility: hidden;
      }
    }

    .node-label {
      margin-left: var(--spacing-xs);
      flex: 1;
    }
  }
}

// 移动端适配
@media (max-width: 768px) {
  .tree-level {
    .tree-node {
      .node-content {
        min-height: 44px;
        padding: var(--spacing-sm) var(--spacing-md);
      }
    }
  }
}
</style>
