<template>
  <div class="start-page">
    <h2 class="main-title">你的故事将从何开始</h2>

    <div class="control-panel-container">
      <ul class="scenario-list">
        <li v-for="scenario in scenarios" :key="scenario.index">
          <button
            class="scenario-option"
            :class="{ selected: selectedIndex === scenario.index }"
            @click="handleScenarioSelect(scenario.index)"
          >
            {{ scenario.label }}
          </button>
        </li>
      </ul>
    </div>

    <div class="output-settings-container">
      <div class="control-group">
        <div class="control-buttons">
          <div v-for="option in outputOptions" :key="option.value" class="control-item-wrapper">
            <button
              class="control-button"
              :class="{ selected: selectedOutput === option.value }"
              @click="selectOutput(option.value)"
            >
              {{ option.label }}
            </button>
            <span class="button-desc">{{ option.desc }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="step-footer">
      <button class="nav-button" @click="$emit('prev')">
        <span>上一步</span>
      </button>
      <button class="nav-button" :disabled="!canProceed || isLoading" @click="handleNext">
        <span>{{ isLoading ? '保存中...' : '开始旅程' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { OUTPUT_OPTIONS, saveOutputSelection } from '../services/outputMethod';
import { scenarios, switchSwipe } from '../services/StartPage';

const emit = defineEmits(['prev']);

const selectedIndex = ref<number | null>(null);
const selectedOutput = ref('');
const isLoading = ref(false);

// 变量输出方式选项
const outputOptions = OUTPUT_OPTIONS;

// 判断是否可以进入下一步（需要同时选择场景和输出方式）
const canProceed = computed(() => {
  return selectedIndex.value !== null && selectedOutput.value !== '';
});

function handleScenarioSelect(index: number) {
  selectedIndex.value = index;
}

function selectOutput(value: string) {
  selectedOutput.value = value;
}

/**
 * 点击下一步：保存输出方式选择并切换场景
 */
async function handleNext() {
  if (!canProceed.value) return;

  isLoading.value = true;
  try {
    // 保存输出方式选择到世界书
    await saveOutputSelection(selectedOutput.value);

    // 切换到选中的场景
    await switchSwipe(selectedIndex.value!);
  } catch (error) {
    console.error('保存设置失败:', error);
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.main-title {
  font-family: var(--title-font);
  font-weight: 700;
  color: var(--title-color);
  text-align: center;
  margin: 0 0 10px 0;
  font-size: 2.2em;
}

.control-panel-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(253, 250, 245, 0.9);
  padding: 15px 20px;
  margin: 25px 0 15px 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.output-settings-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(253, 250, 245, 0.9);
  padding: 15px 20px;
  margin: 0 0 25px 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.control-group {
  margin-bottom: 0;
}

.control-group-title {
  font-weight: 500;
  color: var(--title-color);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-color);
  font-size: 1.1em;
}

.control-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.control-item-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 0 140px;
  max-width: 280px;
}

.control-button {
  font-family: var(--body-font);
  font-size: 0.95em;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  background-color: var(--item-bg-color);
  color: var(--text-color);
  opacity: 0.8;
  width: 100%;
}

.control-button:hover {
  background-color: var(--item-bg-hover-color);
  border-color: var(--border-strong-color);
  opacity: 1;
}

.control-button.selected {
  background-color: var(--item-bg-selected-color);
  border-color: var(--title-color);
  color: var(--title-color);
  font-weight: 500;
  opacity: 1;
}

.button-desc {
  font-size: 0.8em;
  color: #6a514d;
  margin-top: 6px;
  text-align: center;
  opacity: 0.8;
  line-height: 1.3;
  min-height: 1em;
}

.scenario-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.scenario-option {
  font: inherit;
  color: inherit;
  background: var(--item-bg-color);
  border: 1px solid var(--border-color);
  text-align: left;
  width: 100%;
  padding: 12px 15px 12px 40px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  position: relative;
  font-size: 1.05em;
}

.scenario-option::before {
  content: '📜';
  position: absolute;
  left: 15px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.1em;
  opacity: 0.7;
  transition: all 0.2s ease-in-out;
}

.scenario-option:hover {
  background-color: var(--item-bg-hover-color);
  border-color: var(--border-strong-color);
  transform: translateX(5px);
}

.scenario-option:hover::before {
  opacity: 1;
  transform: translateY(-50%) rotate(-5deg);
}

.scenario-option.selected {
  background-color: var(--item-bg-selected-color);
  border-color: var(--title-color);
  color: var(--title-color);
  font-weight: 500;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.scenario-option.selected::after {
  content: '✓';
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  font-weight: bold;
  color: var(--title-color);
}

.step-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 20px;
}

.nav-button {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--body-font);
  font-weight: 500;
  font-size: 1em;
  color: var(--title-color);
  background-color: var(--item-bg-color);
  border: 1px solid var(--border-color);
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.nav-button:hover:not(:disabled) {
  background-color: var(--item-bg-hover-color);
  border-color: var(--border-strong-color);
  transform: translateY(-2px);
}

.nav-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-icon {
  font-size: 1.1em;
}

@media screen and (max-width: 600px) {
  .main-title {
    font-size: 1.8em;
  }

  .scenario-option {
    padding: 10px 15px 10px 35px;
    font-size: 1em;
  }

  .control-item-wrapper {
    flex-basis: 100%;
    max-width: 100%;
  }
}
</style>
