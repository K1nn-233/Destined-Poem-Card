import { FC } from 'react';
import type { DeleteTarget } from '../../../core/hooks/use-delete-confirm';
import { ConfirmModal } from '../ConfirmModal';

export interface DeleteConfirmModalProps {
  /** 是否显示 */
  open: boolean;
  /** 删除目标 */
  target: DeleteTarget | null;
  /** 确认删除回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * 删除确认弹窗组件
 * 抽象各页面重复的删除确认逻辑
 */
export const DeleteConfirmModal: FC<DeleteConfirmModalProps> = ({
  open,
  target,
  onConfirm,
  onCancel,
}) => {
  return (
    <ConfirmModal
      open={open}
      title={`确认删除${target?.type ?? ''}`}
      rows={[
        { label: '名称', value: target?.name ?? '' },
        { label: '提示', value: '此操作不可撤销' },
      ]}
      buttons={[
        { text: '删除', variant: 'danger', onClick: onConfirm },
        { text: '取消', variant: 'secondary', onClick: onCancel },
      ]}
      onClose={onCancel}
    />
  );
};
