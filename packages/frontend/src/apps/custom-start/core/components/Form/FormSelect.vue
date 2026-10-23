<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

interface Option {
  label: string;
  value: string | number;
  disabled?: boolean;
}

interface Props {
  modelValue: string | number;
  options: Option[] | readonly string[] | string[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

interface Emits {
  (e: 'update:modelValue', value: string | number): void;
  (e: 'change', value: string | number): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  disabled: false,
  searchable: false,
  searchPlaceholder: '搜索...',
});

const emit = defineEmits<Emits>();

// 搜索相关状态
const searchQuery = ref('');
const isOpen = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

// 检测是否为触摸设备（移动端）
const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// 规范化选项格式
const normalizedOptions = computed(() => {
  return props.options.map(option => {
    if (typeof option === 'string') {
      return { label: option, value: option, disabled: false };
    }
    return option;
  });
});

// 过滤后的选项
const filteredOptions = computed(() => {
  if (!searchQuery.value.trim()) {
    return normalizedOptions.value;
  }
  const query = searchQuery.value.toLowerCase();
  return normalizedOptions.value.filter(option => option.label.toLowerCase().includes(query));
});

// 当前选中项的显示文本
const displayText = computed(() => {
  const selected = normalizedOptions.value.find(opt => opt.value === props.modelValue);
  return selected ? selected.label : props.placeholder;
});

// 高亮匹配文本
const highlightMatch = (text: string): string => {
  if (!searchQuery.value.trim()) return text;
  const query = searchQuery.value.trim();
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="highlight">$1</mark>');
};

// 选择选项
const selectOption = (option: Option) => {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  emit('change', option.value);
  isOpen.value = false;
  searchQuery.value = '';
};

// 切换下拉框
const toggleDropdown = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  // 仅在非触摸设备（PC端）自动聚焦搜索框
  // 移动端不自动聚焦，避免虚拟键盘弹出遮挡选项
  if (isOpen.value && props.searchable && !isTouchDevice()) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
};

// 点击外部关闭
const handleClickOutside = (event: MouseEvent) => {
  if (wrapperRef.value && !wrapperRef.value.contains(event.target as Node)) {
    isOpen.value = false;
    searchQuery.value = '';
  }
};

// 键盘导航
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    isOpen.value = false;
    searchQuery.value = '';
  }
};

// 非搜索模式下的原生 select 处理
const handleNativeChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
  emit('change', target.value);
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});

// 当下拉框关闭时清空搜索
watch(isOpen, newVal => {
  if (!newVal) {
    searchQuery.value = '';
  }
});
</script>

<template>
  <!-- 可搜索模式：自定义下拉 -->
  <div v-if="searchable" ref="wrapperRef" class="form-select-wrapper searchable">
    <!-- 触发器 -->
    <div
      class="form-select-trigger"
      :class="{ 'is-open': isOpen, 'is-disabled': disabled }"
      @click="toggleDropdown"
    >
      <span class="selected-text">{{ displayText }}</span>
      <span class="select-arrow" :class="{ rotated: isOpen }">▼</span>
    </div>

    <!-- 下拉面板 -->
    <div v-show="isOpen" class="select-dropdown">
      <!-- 搜索框 -->
      <div class="search-box">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="search-input"
          :placeholder="searchPlaceholder"
          @click.stop
        />
        <span v-if="searchQuery" class="clear-btn" @click.stop="searchQuery = ''">✕</span>
      </div>

      <!-- 选项列表 -->
      <div class="options-list">
        <div
          v-for="option in filteredOptions"
          :key="option.value"
          class="option-item"
          :class="{
            'is-selected': option.value === modelValue,
            'is-disabled': option.disabled,
          }"
          @click="selectOption(option)"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span v-html="highlightMatch(option.label)"></span>
        </div>
        <div v-if="filteredOptions.length === 0" class="no-results">无匹配结果</div>
      </div>
    </div>
  </div>

  <!-- 非搜索模式：原生 select -->
  <div v-else class="form-select-wrapper">
    <select
      :value="modelValue"
      :disabled="disabled"
      class="form-select"
      :class="{ 'is-disabled': disabled }"
      @change="handleNativeChange"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in normalizedOptions"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <span class="select-arrow">▼</span>
  </div>
</template>

<style lang="scss" scoped>
.form-select-wrapper {
  position: relative;
  width: 100%;

  &.searchable {
    // 搜索模式特有样式
  }
}

// 原生 select 样式
.form-select {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  padding-right: 36px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 1rem;
  color: var(--text-color);
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-sm);
  outline: none;
  cursor: pointer;
  appearance: none;

  &:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
    background: #fff;
  }

  &:hover:not(:disabled) {
    border-color: var(--border-color-strong);
  }

  &.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--border-color-light);
  }

  option {
    background: var(--input-bg);
    color: var(--text-color);
    padding: var(--spacing-sm);

    &:disabled {
      color: var(--text-light);
    }
  }
}

// 自定义触发器样式
.form-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 1rem;
  color: var(--text-color);
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-sm);
  cursor: pointer;

  &:hover:not(.is-disabled) {
    border-color: var(--border-color-strong);
  }

  &.is-open {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
  }

  &.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--border-color-light);
  }

  .selected-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// 下拉箭头
.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--accent-color);
  font-size: 0.7rem;
  pointer-events: none;
  transition: transform var(--transition-normal);

  .form-select:focus ~ & {
    transform: translateY(-50%) rotate(180deg);
  }

  // 触发器内的箭头
  .form-select-trigger & {
    position: static;
    transform: none;
    transition: transform var(--transition-normal);

    &.rotated {
      transform: rotate(180deg);
    }
  }
}

// 下拉面板
.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

// 搜索框
.search-box {
  position: relative;
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);

  .search-input {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    padding-right: 28px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    outline: none;
    background: var(--input-bg);
    color: var(--text-color);

    &:focus {
      border-color: var(--accent-color);
    }

    &::placeholder {
      color: var(--text-light);
    }
  }

  .clear-btn {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-light);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 2px 4px;

    &:hover {
      color: var(--text-color);
    }
  }
}

// 选项列表
.options-list {
  max-height: 240px;
  overflow-y: auto;
}

.option-item {
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background-color var(--transition-fast);

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

  :deep(.highlight) {
    background: rgba(212, 175, 55, 0.3);
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
  }
}

.no-results {
  padding: var(--spacing-md);
  text-align: center;
  color: var(--text-light);
  font-size: 0.9rem;
}

// 移动端适配
@media (max-width: 768px) {
  .option-item {
    min-height: 44px;
    display: flex;
    align-items: center;
    padding: var(--spacing-md);
  }

  .search-input {
    min-height: 40px;
  }
}
</style>
