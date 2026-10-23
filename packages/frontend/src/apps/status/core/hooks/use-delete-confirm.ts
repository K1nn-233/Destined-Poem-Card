import { useCallback, useState } from 'react';
import { useMvuDataStore } from '../stores';

/**
 * 删除目标类型
 */
export interface DeleteTarget {
  /** 删除类型（如：状态效果、伙伴、装备等） */
  type: string;
  /** 数据路径 */
  path: string;
  /** 项目名称 */
  name: string;
}

/**
 * 删除确认 Hook 返回值
 */
export interface UseDeleteConfirmReturn {
  /** 当前删除目标 */
  deleteTarget: DeleteTarget | null;
  /** 设置删除目标（打开确认弹窗） */
  setDeleteTarget: (target: DeleteTarget | null) => void;
  /** 执行删除操作 */
  handleDelete: () => Promise<void>;
  /** 取消删除（关闭弹窗） */
  cancelDelete: () => void;
  /** 是否显示确认弹窗 */
  isConfirmOpen: boolean;
}

/**
 * 删除确认 Hook
 * 抽象重复的删除确认逻辑，用于 StatusTab, DestinyTab, ItemsTab 等
 *
 * @example
 * ```tsx
 * const { deleteTarget, setDeleteTarget, handleDelete, cancelDelete, isConfirmOpen } = useDeleteConfirm();
 *
 * // 触发删除
 * setDeleteTarget({ type: '装备', path: '主角.装备.铁剑', name: '铁剑' });
 *
 * // 渲染确认弹窗
 * <ConfirmModal
 *   open={isConfirmOpen}
 *   title={`确认删除${deleteTarget?.type ?? ''}`}
 *   rows={[
 *     { label: '名称', value: deleteTarget?.name ?? '' },
 *     { label: '操作', value: '此操作不可撤销' },
 *   ]}
 *   buttons={[
 *     { text: '删除', variant: 'danger', onClick: handleDelete },
 *     { text: '取消', variant: 'secondary', onClick: cancelDelete },
 *   ]}
 *   onClose={cancelDelete}
 * />
 * ```
 */
export const useDeleteConfirm = (): UseDeleteConfirmReturn => {
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const { deleteField } = useMvuDataStore();

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      await deleteField(deleteTarget.path);
      toastr.success(`已删除「${deleteTarget.name}」`);
    } catch {
      toastr.error('删除失败');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteField]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  return {
    deleteTarget,
    setDeleteTarget,
    handleDelete,
    cancelDelete,
    isConfirmOpen: !!deleteTarget,
  };
};
