<template>
  <div class="env-check-page">
    <h2 class="main-title">环境检查</h2>

    <!-- 环境检查部分 -->
    <div class="env-check-container">
      <!-- 酒馆助手 -->
      <div class="env-check-item">
        <div class="env-check-label">
          <span class="icon">⚙️</span>
          <span>酒馆助手</span>
        </div>
        <div class="env-check-details">
          <span
            >版本:
            <strong :class="'status-' + (envStatus.tavernHelper.version ? 'ok' : 'unknown')">
              {{ envStatus.tavernHelper.version || '未知' }}
            </strong></span
          >
          <span
            >状态:
            <strong :class="'status-' + envStatus.tavernHelper.status">
              {{ envStatus.tavernHelper.statusText }}
            </strong></span
          >
        </div>
      </div>

      <!-- 提示词模板 (EJS) -->
      <div class="env-check-item">
        <div class="env-check-label">
          <span class="icon">📄</span>
          <span>提示词模板 (EJS)</span>
        </div>
        <div class="env-check-details">
          <span
            >状态:
            <strong :class="'status-' + envStatus.ejsTemplate.status">
              {{ envStatus.ejsTemplate.statusText }}
            </strong></span
          >
          <span
            >启用?:
            <strong :class="'status-' + envStatus.ejsTemplate.enabledStatus">
              {{ envStatus.ejsTemplate.enabledText }}
            </strong></span
          >
        </div>
      </div>

      <!-- MVU 框架 -->
      <div class="env-check-item">
        <div class="env-check-label">
          <span class="icon">🧩</span>
          <span>MVU 框架</span>
        </div>
        <div class="env-check-details">
          <span
            >状态:
            <strong :class="'status-' + envStatus.mvu.status">
              {{ envStatus.mvu.statusText }}
            </strong></span
          >
        </div>
      </div>

      <div class="recheck-container">
        <button class="recheck-button" :disabled="isChecking" @click="handleRecheck">
          {{ isChecking ? '检查中...' : '重新检查' }}
        </button>
        <button v-if="canSkip" class="skip-button" @click="showSkipConfirm = true">跳过检查</button>
      </div>
    </div>

    <!-- 检查通过提示 -->
    <transition name="fade">
      <div v-if="envStatus.allOk && !isChecking" class="success-message">
        <span class="success-icon">✅</span>
        <span>环境检查通过，正在跳转...</span>
      </div>
    </transition>

    <!-- 跳过确认弹窗 -->
    <transition name="fade">
      <div v-if="showSkipConfirm" class="modal-overlay" @click.self="showSkipConfirm = false">
        <div class="modal-content">
          <h3 class="modal-title">⚠️ 跳过环境检查</h3>
          <div class="modal-body">
            <p>您即将跳过环境检查，请仔细阅读并确认以下内容：</p>
            <ul class="modal-list">
              <li>我已确认当前运行环境中所有组件均<strong>无异常</strong></li>
              <li>我了解跳过环境检查可能导致后续功能<strong>无法正常使用</strong></li>
              <li>若因环境问题导致的任何异常，<strong>作者不承担任何责任</strong></li>
            </ul>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" @click="showSkipConfirm = false">
              取消
            </button>
            <button class="modal-btn modal-btn-confirm" @click="confirmSkip">确认跳过</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { initialEnvStatus, performFullEnvCheck } from '../services/envCheck';

const emit = defineEmits(['next', 'envCheckComplete']);

const isChecking = ref(false);
const recheckCount = ref(0);
const showSkipConfirm = ref(false);

const envStatus = ref({ ...initialEnvStatus });

/** 重新检查3次仍未通过时，允许跳过 */
const canSkip = computed(() => {
  return recheckCount.value >= 3 && !envStatus.value.allOk && !isChecking.value;
});

async function performCheck() {
  isChecking.value = true;

  try {
    const result = await performFullEnvCheck();
    envStatus.value = result;
    emit('envCheckComplete', result);
  } catch (error) {
    console.error('环境检查失败:', error);
  } finally {
    isChecking.value = false;
  }
}

/** 手动重新检查，累加计数 */
function handleRecheck() {
  recheckCount.value++;
  performCheck();
}

/** 确认跳过，关闭弹窗并执行下一步 */
function confirmSkip() {
  showSkipConfirm.value = false;
  emit('next');
}

// 监听环境检查状态，检查通过后自动跳转到下一页
watch(
  () => envStatus.value.allOk,
  allOk => {
    if (allOk && !isChecking.value) {
      emit('next');
    }
  },
);

onMounted(() => {
  performCheck();
});
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

.env-check-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(253, 250, 245, 0.9);
  padding: 10px 20px;
  margin: 25px 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.env-check-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 5px;
  flex-wrap: wrap;
  gap: 10px;
}

.env-check-item:not(:last-child) {
  border-bottom: 1px dashed var(--border-color);
}

.env-check-label {
  display: flex;
  align-items: center;
  font-weight: 500;
  color: var(--title-color);
}

.env-check-label .icon {
  font-size: 1.4em;
  margin-right: 12px;
  opacity: 0.8;
  line-height: 1;
}

.env-check-details {
  display: flex;
  align-items: center;
  font-size: 0.9em;
  gap: 15px;
  text-align: right;
}

.env-check-details strong {
  font-weight: 700;
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  min-width: 55px;
  text-align: center;
  border: 1px solid transparent;
}

/* 淡入淡出过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.recheck-container {
  text-align: center;
  margin: 15px 0 0 0;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.recheck-button {
  font-family: var(--body-font);
  font-weight: 500;
  font-size: 1em;
  color: var(--title-color);
  background-color: var(--item-bg-color);
  border: 1px solid var(--border-color);
  padding: 8px 25px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.recheck-button:hover:not(:disabled) {
  background-color: var(--item-bg-hover-color);
  border-color: var(--border-strong-color);
}

.recheck-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.skip-button {
  font-family: var(--body-font);
  font-weight: 500;
  font-size: 1em;
  color: #856404;
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  padding: 8px 25px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.skip-button:hover {
  background-color: #ffe69c;
  border-color: #e0a800;
}

.success-message {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  margin-top: 15px;
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 6px;
  color: #155724;
  font-weight: 500;
}

.success-icon {
  font-size: 1.2em;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background-color: #fffdf7;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 24px 28px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.modal-title {
  font-family: var(--title-font);
  font-weight: 700;
  color: #856404;
  margin: 0 0 16px 0;
  font-size: 1.3em;
  text-align: center;
}

.modal-body {
  font-size: 0.95em;
  color: var(--text-color, #333);
  line-height: 1.6;
}

.modal-body p {
  margin: 0 0 10px 0;
}

.modal-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.modal-list li {
  margin-bottom: 8px;
}

.modal-list li strong {
  color: #c0392b;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.modal-btn {
  font-family: var(--body-font);
  font-weight: 500;
  font-size: 0.95em;
  padding: 8px 22px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  border: 1px solid transparent;
}

.modal-btn-cancel {
  color: var(--title-color);
  background-color: var(--item-bg-color, #f0f0f0);
  border-color: var(--border-color, #ccc);
}

.modal-btn-cancel:hover {
  background-color: var(--item-bg-hover-color, #e0e0e0);
}

.modal-btn-confirm {
  color: #fff;
  background-color: #e67e22;
  border-color: #d35400;
}

.modal-btn-confirm:hover {
  background-color: #d35400;
}

@media screen and (max-width: 600px) {
  .main-title {
    font-size: 1.8em;
  }
}
</style>
